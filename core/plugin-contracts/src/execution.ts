/**
 * Execution metadata and results for plugin execution.
 */

/**
 * Execution metadata from runner layer.
 */
export interface ExecutionMeta {
  /** Execution start time (Unix timestamp ms) */
  startTime: number;

  /** Execution end time (Unix timestamp ms) */
  endTime: number;

  /** Execution duration in milliseconds */
  duration: number;

  /** Plugin ID that was executed */
  pluginId: string;

  /** Plugin version */
  pluginVersion: string;

  /** Handler ID (command, route, etc.) */
  handlerId?: string;

  /** Request ID for distributed tracing */
  requestId: string;

  /** Tenant ID (for multi-tenancy) */
  tenantId?: string;
}

/**
 * Result from runner layer (subprocess, worker, etc.)
 */
export interface RunResult<T> {
  /** Success indicator */
  ok: boolean;

  /** Result data (if successful) */
  data?: T;

  /** Error (if failed) */
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };

  /** Execution metadata */
  executionMeta: ExecutionMeta;
}
