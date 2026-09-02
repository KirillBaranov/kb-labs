/**
 * @module @kb-labs/workflow-runtime/builtin-handlers/shell
 * Built-in shell execution handler for workflows
 *
 * Security features:
 * - Blocks dangerous commands (rm -rf /, fork bombs, etc.)
 * - Timeout enforcement (default 5 minutes)
 * - Environment variable isolation
 * - Working directory restrictions
 */

import { execaCommand } from 'execa';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

/**
 * Commands that are always blocked (dangerous)
 */
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:', // Fork bomb
  'chmod -R 777 /',
  'chown -R',
  '> /dev/sda',
  'mv /* ',
  'fdisk',
];

/** Cap on how much of a failed command's output gets attached to its log entry. */
const FAILURE_OUTPUT_TAIL_CHARS = 4000;

/** Cap on how much of a surfaced ::kb-output:: marker line gets attached — see `tail()`. */
const MARKER_LINE_MAX_CHARS = 2000;

/**
 * The last `::kb-output::`/`::kb-output:base64::` line in `text`, or null.
 * A `kb` command reports its real structured result on one of these lines
 * (e.g. `{"ok":false,"failed":["dist-exports"],...}`) — often followed by a
 * wrapper's own generic exit banner (pnpm's "[ELIFECYCLE] Command failed
 * with exit code 1."), which then becomes the literal last bytes of output.
 */
function lastOutputMarkerLine(text: string): string | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(OUTPUT_MARKER_B64) || lines[i].includes(OUTPUT_MARKER)) {
      return lines[i];
    }
  }
  return null;
}

/**
 * Last N characters of `text`, prefixed with a marker when it was truncated.
 * Tail (not head) because the actionable error is almost always at the end —
 * a stack trace, an assertion failure, the final "Error:" line.
 *
 * Exception: a raw byte-count tail alone silently drops the one thing that
 * actually explains a failed `kb` command. A wrapper's generic exit banner
 * (pnpm's "[ELIFECYCLE] Command failed...") becomes the true last bytes of
 * output, while the command's own `::kb-output::` result — the whole reason
 * `runReleaseChecks` and friends exist — sits earlier in the stream and gets
 * discarded (observed live: a failed `release checks` step logged only
 * "[ELIFECYCLE] Command failed with exit code 1." with the real
 * `{"ok":false,"failed":[...]}` payload truncated away). When a marker line
 * is present, surface it ahead of the raw tail instead of dropping it.
 */
export function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) {return text;}
  const rawTail = `…(truncated, showing last ${maxChars} of ${text.length} chars)\n${text.slice(-maxChars)}`;
  const markerLine = lastOutputMarkerLine(text);
  if (!markerLine || rawTail.includes(markerLine)) {return rawTail;}
  const markerSnippet = markerLine.length > MARKER_LINE_MAX_CHARS
    ? `${markerLine.slice(0, MARKER_LINE_MAX_CHARS)}…(marker line truncated, ${markerLine.length} chars total)`
    : markerLine;
  return `${markerSnippet}\n${rawTail}`;
}

/**
 * Split string into chunks of specified size
 */
function chunkString(str: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Shell handler input
 */
export interface ShellInput {
  /** Command to execute */
  command: string;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Timeout in milliseconds (default: 300000 = 5 min) */
  timeout?: number;

  /** Throw on non-zero exit code (default: false) */
  throwOnError?: boolean;
}

/**
 * Shell handler output
 */
export interface ShellOutput {
  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Exit code */
  exitCode: number;

  /** Whether command succeeded (exitCode === 0) */
  ok: boolean;
}

/**
 * Plain-JSON output marker.
 *   echo '::kb-output::{"passed":true}'
 *
 * Only safe for values without embedded newlines, quotes, or control chars.
 * For multi-line text, binary data, or any value produced by a sub-command,
 * prefer the base64 variant below.
 */
const OUTPUT_MARKER = '::kb-output::';

/**
 * Base64-encoded JSON output marker — JSON-safe for any payload.
 *
 * Usage (shell):
 *   PAYLOAD=$(jq -cn --arg plan "$(cat /tmp/plan.md)" '{plan: $plan}' | base64 -w0)
 *   echo "::kb-output:base64::${PAYLOAD}"
 *
 * This handles multi-line text, special chars, and any binary-safe content.
 * The base64 string is decoded and JSON-parsed by the runtime.
 */
const OUTPUT_MARKER_B64 = '::kb-output:base64::';

/**
 * Parse a single ::kb-output:: or ::kb-output:base64:: marker line into key-value pairs.
 *
 * Returns the parsed object, or null if the line is not a recognized marker.
 * Throws a descriptive error if the marker payload is malformed so callers can warn.
 */
export function parseOutputMarkerLine(line: string): Record<string, unknown> | null {
  // Base64-encoded variant — JSON-safe for any payload
  const b64Idx = line.indexOf(OUTPUT_MARKER_B64);
  if (b64Idx !== -1) {
    const raw = line.slice(b64Idx + OUTPUT_MARKER_B64.length).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new Error(`::kb-output:base64:: payload is not valid base64`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`::kb-output:base64:: malformed JSON payload after decode: ${detail}`);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`::kb-output:base64:: JSON must be an object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }

  // Plain-JSON variant — only safe for simple scalar values
  const idx = line.indexOf(OUTPUT_MARKER);
  if (idx !== -1) {
    const raw = line.slice(idx + OUTPUT_MARKER.length);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`::kb-output:: malformed JSON payload: ${detail}`);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`::kb-output:: JSON must be an object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }

  return null;
}

/**
 * Extract structured outputs from shell stdout.
 *
 * Priority:
 * 1. ::kb-output:base64:: marker lines — JSON-safe, recommended for complex values
 * 2. ::kb-output:: marker lines — plain JSON, ok for simple scalars
 * 3. Entire stdout as JSON — fallback for backward compat (simple commands)
 *
 * Malformed markers emit a warning instead of silently dropping the output.
 * Logs and other stdout content are ignored for output purposes.
 */
export function mergeJsonOutputs(output: ShellOutput, warn?: (msg: string) => void): Record<string, unknown> {
  const base: Record<string, unknown> = { ...output };
  const trimmed = output.stdout.trim();
  if (!trimmed) {return base;}

  // Priority 1 + 2: Look for ::kb-output:: or ::kb-output:base64:: marker lines
  const lines = output.stdout.split('\n');
  let foundMarker = false;
  for (const line of lines) {
    if (!line.includes('::kb-output')) {continue;}
    foundMarker = true;
    try {
      const parsed = parseOutputMarkerLine(line);
      if (parsed) {
        Object.assign(base, parsed);
      }
    } catch (err) {
      // Malformed marker — warn instead of silently dropping
      const msg = err instanceof Error ? err.message : String(err);
      warn?.(`Malformed ::kb-output:: marker (outputs not populated): ${msg}`);
    }
  }

  if (foundMarker) {return base;}

  // Priority 3: Fallback — entire stdout as JSON (backward compat)
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(base, parsed as Record<string, unknown>);
    }
  } catch {
    // Not JSON — return as-is
  }

  return base;
}

/**
 * Built-in shell execution handler.
 *
 * Executes shell commands with safety checks and timeout enforcement.
 *
 * @param ctx - Handler execution context
 * @param input - Shell command input
 * @returns Shell execution result
 * @throws Error if dangerous command detected or timeout exceeded
 */
async function shellHandler(
  ctx: PluginContextV3,
  input: ShellInput,
): Promise<Record<string, unknown>> {
  const { command, env = {}, timeout = 300000, throwOnError = false } = input;

  // Security: Check for dangerous commands
  const normalizedCommand = command.toLowerCase().trim();
  for (const blocked of BLOCKED_COMMANDS) {
    if (normalizedCommand.includes(blocked.toLowerCase())) {
      throw new Error(
        `Dangerous command blocked: "${blocked}". Command attempted: ${command.slice(0, 100)}`,
      );
    }
  }

  // Get working directory from context (workflow workspace)
  const cwd = ctx.cwd;

  // Merge environment variables
  const mergedEnv = {
    ...process.env,
    ...env,
  };

  ctx.platform.logger.info('Executing shell command', {
    command: command.slice(0, 200),
    cwd,
    timeout,
  });

  try {
    // detached: true puts the subprocess in its own process group. On timeout we kill
    // the entire group (process.kill(-pid, 'SIGKILL')), which takes down both the shell
    // and any children it spawned. Without this, SIGTERM reaches only the shell; child
    // processes (e.g. `sleep N`) inherit the pipe write-end and block await indefinitely.
    const proc = execaCommand(command, {
      cwd,
      env: mergedEnv,
      shell: true,
      stdio: 'pipe',
      reject: false, // We handle exit codes ourselves
      detached: true,
    });

    // Stream stdout/stderr line-by-line in real-time.
    // We consume the streams ourselves via 'data' events for live log streaming.
    // Because attaching a 'data' listener drains the stream, execa's result.stdout
    // will be empty — we must reconstruct the full output from collected chunks.
    let lineNo = 0;
    let stdoutBuf = '';
    let stderrBuf = '';
    let stdoutFull = '';
    let stderrFull = '';

    const emitLine = (stream: 'stdout' | 'stderr', line: string) => {
      lineNo++;
      // stderr is an output stream, not an exit-status signal. Several
      // perfectly successful tools (notably command discovery) deliberately
      // write diagnostics there. The step result is evaluated from exitCode;
      // keep stderr visible without turning every diagnostic line into an
      // error event.
      void ctx.api.events.emit('log.line', { stream, line, lineNo, level: stream === 'stderr' ? 'warn' : 'info' });
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutFull += text;
      stdoutBuf += text;
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {emitLine('stdout', line);}
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrFull += text;
      stderrBuf += text;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {emitLine('stderr', line);}
    });

    // Self-managed timeout: kill the entire process group so orphaned children
    // release the pipe write-end and await proc resolves immediately.
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      const pid = proc.pid;
      if (pid !== undefined) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // process already exited
        }
      }
    }, timeout);

    const result = await proc;
    clearTimeout(killTimer);

    // Flush remaining buffered content
    if (stdoutBuf) {emitLine('stdout', stdoutBuf);}
    if (stderrBuf) {emitLine('stderr', stderrBuf);}

    if (timedOut) {
      // Whatever the command printed before the kill is the only clue to
      // whether it was hung or just slow — without it the run log shows a
      // multi-hour gap between "Executing shell command" and this error and
      // nothing in between (see kb-labs incident: 20min Build-step timeout
      // debugged blind because of exactly this).
      ctx.platform.logger.warn('Shell command timed out', {
        timeoutMs: timeout,
        stderrTail: tail(stderrFull, FAILURE_OUTPUT_TAIL_CHARS),
        stdoutTail: tail(stdoutFull, FAILURE_OUTPUT_TAIL_CHARS),
      });
      throw new Error(`Shell command timed out after ${timeout}ms`);
    }

    const output: ShellOutput = {
      // Use our accumulated buffers — result.stdout/stderr are empty because
      // we consumed the streams via 'data' listeners above.
      stdout: stdoutFull || result.stdout,
      stderr: stderrFull || result.stderr,
      exitCode: result.exitCode ?? 0,
      ok: (result.exitCode ?? 0) === 0,
    };

    if (output.ok) {
      ctx.platform.logger.info('Shell command completed successfully', {
        exitCode: output.exitCode,
        stdoutLines: output.stdout.split('\n').length,
      });
    } else {
      // Attach the actual output, not just its shape — this is the log entry
      // that shows up in `kb workflow runs logs`, and it used to carry only
      // exitCode + a line count. Debugging a failed step meant re-running the
      // command outside the workflow just to see why it failed.
      ctx.platform.logger.warn('Shell command failed', {
        exitCode: output.exitCode,
        stderrLines: output.stderr.split('\n').length,
        stderrTail: tail(output.stderr, FAILURE_OUTPUT_TAIL_CHARS),
        stdoutTail: tail(output.stdout, FAILURE_OUTPUT_TAIL_CHARS),
      });

      if (throwOnError) {
        throw new Error(`Shell command failed with exit code ${output.exitCode}: ${output.stderr.slice(0, 500)}`);
      }
    }

    return mergeJsonOutputs(output, (msg) => ctx.platform.logger.warn(`[shell] ${msg}`));
  } catch (error) {
    // Handle timeout
    if (error && typeof error === 'object' && 'timedOut' in error && error.timedOut) {
      throw new Error(`Shell command timed out after ${timeout}ms`);
    }

    // Handle execution error
    if (error && typeof error === 'object' && 'exitCode' in error) {
      const execError = error as { exitCode?: number; stdout?: string; stderr?: string };
      const output: ShellOutput = {
        stdout: execError.stdout ?? '',
        stderr: execError.stderr ?? '',
        exitCode: execError.exitCode ?? 1,
        ok: false,
      };

      ctx.platform.logger.error('Shell command execution failed', undefined, {
        exitCode: output.exitCode,
        stderr: output.stderr.slice(0, 500),
      });

      if (!throwOnError) {
        return { ...output };
      }
    }

    throw error;
  }
}

// Export handler in format expected by ExecutionBackend
export default {
  execute: shellHandler,
};
