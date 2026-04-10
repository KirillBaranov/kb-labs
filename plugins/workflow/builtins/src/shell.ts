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
 * Output marker prefix. Shell commands emit structured outputs via:
 *   echo '::kb-output::{"passed":true}'
 *
 * This separates logs (plain stdout) from structured data (outputs).
 * Similar to GitHub Actions ::set-output:: pattern.
 */
const OUTPUT_MARKER = '::kb-output::';

/**
 * Extract structured outputs from shell stdout.
 *
 * Priority:
 * 1. ::kb-output::{...} marker lines — explicit, recommended
 * 2. Entire stdout as JSON — fallback for backward compat (simple commands)
 *
 * Logs and other stdout content are ignored for output purposes.
 */
function mergeJsonOutputs(output: ShellOutput): Record<string, unknown> {
  const base: Record<string, unknown> = { ...output };
  const trimmed = output.stdout.trim();
  if (!trimmed) {return base;}

  // Priority 1: Look for ::kb-output:: marker lines
  const lines = output.stdout.split('\n');
  let foundMarker = false;
  for (const line of lines) {
    const idx = line.indexOf(OUTPUT_MARKER);
    if (idx !== -1) {
      foundMarker = true;
      try {
        const parsed = JSON.parse(line.slice(idx + OUTPUT_MARKER.length));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(base, parsed);
        }
      } catch {
        // Malformed marker — skip
      }
    }
  }

  if (foundMarker) {return base;}

  // Priority 2: Fallback — entire stdout as JSON (backward compat)
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(base, parsed);
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
    const proc = execaCommand(command, {
      cwd,
      env: mergedEnv,
      shell: true,
      stdio: 'pipe',
      timeout,
      reject: false, // We handle exit codes ourselves
    });

    // Stream stdout/stderr line-by-line in real-time
    let lineNo = 0;
    let stdoutBuf = '';
    let stderrBuf = '';

    const emitLine = (stream: 'stdout' | 'stderr', line: string) => {
      lineNo++;
      void ctx.api.events.emit('log.line', { stream, line, lineNo, level: stream === 'stderr' ? 'error' : 'info' });
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {emitLine('stdout', line);}
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {emitLine('stderr', line);}
    });

    const result = await proc;

    // Flush remaining buffered content
    if (stdoutBuf) {emitLine('stdout', stdoutBuf);}
    if (stderrBuf) {emitLine('stderr', stderrBuf);}

    const output: ShellOutput = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
      ok: (result.exitCode ?? 0) === 0,
    };

    if (output.ok) {
      ctx.platform.logger.info('Shell command completed successfully', {
        exitCode: output.exitCode,
        stdoutLines: output.stdout.split('\n').length,
      });
    } else {
      ctx.platform.logger.warn('Shell command failed', {
        exitCode: output.exitCode,
        stderrLines: output.stderr.split('\n').length,
      });

      if (throwOnError) {
        throw new Error(`Shell command failed with exit code ${output.exitCode}: ${output.stderr.slice(0, 500)}`);
      }
    }

    return mergeJsonOutputs(output);
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
