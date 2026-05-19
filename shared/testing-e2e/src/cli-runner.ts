import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveWorkspaceRoot } from './workspace-root.js';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnCliOptions {
  /** Override working directory (defaults to workspace root). */
  cwd?: string;
  /** Additional env vars merged on top of process.env. */
  env?: Record<string, string>;
  /** Milliseconds before SIGKILL (default: 30_000). */
  timeoutMs?: number;
}

/**
 * Resolve the binary and args needed to invoke the `kb` CLI.
 *
 * Resolution order:
 *   1. KB_BIN env var — treated as the executable, args passed as-is
 *   2. <workspaceRoot>/node_modules/.bin/kb — standalone binary (published installs)
 *   3. node <workspaceRoot>/cli/bin/dist/bin.js — dev workspace (monorepo, no standalone binary)
 */
function resolveKbCommand(workspaceRoot: string, args: string[]): { bin: string; argv: string[] } {
  if (process.env.KB_BIN) {
    return { bin: process.env.KB_BIN, argv: args };
  }
  const binPath = resolve(workspaceRoot, 'node_modules/.bin/kb');
  if (existsSync(binPath)) {
    return { bin: binPath, argv: args };
  }
  const entryPath = resolve(workspaceRoot, 'cli/bin/dist/bin.js');
  return { bin: process.execPath, argv: [entryPath, ...args] };
}

/**
 * Spawn a real `kb` CLI process and capture its stdout/stderr/exit code.
 *
 * Inherits the current process environment so daemon URLs and project root are propagated.
 */
export function spawnCliCommand(args: string[], opts: SpawnCliOptions = {}): Promise<CliResult> {
  const workspaceRoot = opts.cwd ?? resolveWorkspaceRoot();
  const { bin, argv } = resolveKbCommand(workspaceRoot, args);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise((resolvePromise) => {
    // Force silent logging so no diagnostic lines pollute stdout.
    // KB_OUTPUT_MODE=json suppresses the pino adapter; KB_LOG_LEVEL=silent
    // suppresses the ConsoleLogger fallback (used before initPlatform).
    const isJsonCmd = args.includes('--json');
    const child = spawn(bin, argv, {
      cwd: workspaceRoot,
      env: {
        ...(process.env as Record<string, string>),
        KB_LOG_LEVEL: 'silent',
        ...(isJsonCmd ? { KB_OUTPUT_MODE: 'json' } : {}),
        ...(opts.env ?? {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? -1, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: -1, stdout, stderr: stderr + '\n' + err.message });
    });
  });
}

/**
 * Run a kb CLI command that outputs JSON and return the parsed result.
 * Throws if the process exits with non-zero or stdout is not valid JSON.
 */
export async function spawnCliJson<T>(args: string[], opts: SpawnCliOptions = {}): Promise<T> {
  const result = await spawnCliCommand(args, opts);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI 'kb ${args.join(' ')}' exited with code ${result.exitCode}\n` +
      `stdout: ${result.stdout.slice(0, 1000)}\n` +
      `stderr: ${result.stderr.slice(0, 1000)}`,
    );
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `Failed to parse JSON from 'kb ${args.join(' ')}':\n` +
      `  stdout: ${result.stdout.slice(0, 1000)}\n` +
      `  stderr: ${result.stderr.slice(0, 1000)}`,
    );
  }
}
