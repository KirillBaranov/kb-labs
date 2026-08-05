/** Governed ShellAPI facade. Native spawning belongs to IProcessExecutor. */

import { basename } from 'node:path';
import type { ShellAPI, ExecResult, ExecOptions, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';
import type { IProcessExecutor, ProcessExecutionIdentity } from '@kb-labs/core-platform/adapters';

const BLOCKED_COMMANDS = [
  'rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=', ':(){:|:&};:',
  'chmod -R 777 /', 'chown -R', '> /dev/sda', 'mv /* ',
];

export interface CreateShellAPIOptions {
  permissions: PermissionSpec;
  cwd: string;
  processExecutor?: IProcessExecutor;
  processIdentity?: ProcessExecutionIdentity;
  signal?: AbortSignal;
}

function processError(error: unknown): Error {
  if (error instanceof Error) { return error; }
  return new Error(String(error));
}

export function createShellAPI(options: CreateShellAPIOptions): ShellAPI {
  const { permissions, cwd } = options;
  const allowedCommands = permissions.shell?.allow ?? [];
  if (allowedCommands.length === 0) {
    return { async exec(): Promise<never> { throw new PermissionError('Shell execution not allowed'); } };
  }

  const executor = options.processExecutor;
  if (!executor) {
    throw new Error('Governed process executor is unavailable in this execution host');
  }
  const identity = options.processIdentity ?? {
    executionId: 'unknown-execution', requestId: 'unknown-request', pluginId: 'unknown-plugin',
  };
  const quotas = permissions.quotas ?? {};

  return {
    async exec(command: string, args: string[] = [], execOptions?: ExecOptions): Promise<ExecResult> {
      const fullCommand = `${command} ${args.join(' ')}`;
      for (const blocked of BLOCKED_COMMANDS) {
        if (fullCommand.includes(blocked)) {
          throw new PermissionError('Dangerous command blocked', { command: fullCommand, blocked });
        }
      }
      if (!allowedCommands.includes(command) && !allowedCommands.includes(basename(command)) && !allowedCommands.includes('*')) {
        throw new PermissionError('Command not in whitelist', { command, allowedCommands });
      }

      const requestedTimeout = execOptions?.timeout ?? quotas.timeoutMs ?? 30_000;
      const timeoutMs = Math.min(requestedTimeout, quotas.timeoutMs ?? requestedTimeout);
      const result = await executor.execute({
        identity,
        command,
        args,
        cwd: execOptions?.cwd ?? cwd,
        env: execOptions?.env,
        signal: execOptions?.signal ?? options.signal,
        retry: execOptions?.retry,
        limits: {
          timeoutMs,
          cpuMs: quotas.cpuMs,
          memoryMb: quotas.memoryMb,
          maxProcesses: quotas.maxProcesses,
          maxConcurrent: permissions.shell?.maxConcurrent,
          maxOutputBytes: execOptions?.maxOutputBytes ?? quotas.maxOutputBytes,
        },
      });
      const output: ExecResult = {
        code: result.code ?? -1,
        stdout: result.stdout,
        stderr: result.stderr,
        ok: result.ok,
        processId: result.processId,
        terminationReason: result.terminationReason,
        usage: result.usage,
        attempts: result.attempts,
      };
      if (execOptions?.throwOnError && !output.ok) {
        const error = new Error(`Command failed with code ${output.code}: ${output.stderr}`);
        Object.assign(error, { code: 'PROCESS_EXIT_NON_ZERO', result: output });
        throw error;
      }
      return output;
    },
  };
}

export function normalizeShellError(error: unknown): Error {
  return processError(error);
}
