/**
 * @module @kb-labs/core-contracts
 *
 * Subprocess runner interface - contract for running handlers in subprocesses.
 */

import type { ExecutionDescriptorCore } from './execution-request.js';
import type { RunResult } from './execution-response.js';

// Re-export for convenience
export type { RunResult } from './execution-response.js';

/**
 * Options for subprocess execution.
 */
export interface SubprocessRunOptions {
  /** Plugin context descriptor */
  descriptor: ExecutionDescriptorCore | unknown;

  /** Platform socket path (Unix socket) */
  platformSocketPath: string;

  /** Platform auth token for gateway security */
  platformAuthToken: string;

  /** Handler file path */
  handlerPath: string;

  /** Handler export name (default: "default") */
  exportName?: string;

  /** Input data for handler */
  input: unknown;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /** Current working directory for handler execution */
  cwd: string;

  /** Output directory (optional, defaults to ${cwd}/.kb/output) */
  outdir?: string;

  /** Callback for real-time log streaming */
  onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void;
}

/**
 * Subprocess runner interface.
 *
 * Implemented by @kb-labs/plugin-runtime.
 * Used by @kb-labs/plugin-execution SubprocessBackend.
 */
export interface ISubprocessRunner {
  /**
   * Run handler in subprocess with IPC communication.
   *
   * @throws {PluginError} Handler execution failed
   * @throws {TimeoutError} Execution exceeded timeout
   * @throws {AbortError} Execution was cancelled
   */
  runInSubprocess<T>(options: SubprocessRunOptions): Promise<RunResult<T>>;
}
