/**
 * @module @kb-labs/core-contracts/execution-events
 *
 * Unified execution event types.
 * Generated once on the server, streamed to N clients via Gateway.
 */

/**
 * Union of all execution event types.
 */
export type ExecutionEvent =
  | ExecutionOutputEvent
  | ExecutionProgressEvent
  | ExecutionArtifactEvent
  | ExecutionErrorEvent
  | ExecutionRetryEvent
  | ExecutionCancelledEvent
  | ExecutionDoneEvent;

/**
 * Output from handler execution (stdout/stderr).
 */
export interface ExecutionOutputEvent {
  type: 'execution:output';
  requestId: string;
  executionId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

/**
 * Progress update from handler execution.
 */
export interface ExecutionProgressEvent {
  type: 'execution:progress';
  requestId: string;
  executionId: string;
  step: number;
  total: number;
  label: string;
  timestamp: number;
}

/**
 * Artifact produced by handler execution.
 */
export interface ExecutionArtifactEvent {
  type: 'execution:artifact';
  requestId: string;
  executionId: string;
  name: string;
  mime: string;
  url: string;
  sizeBytes?: number;
}

/**
 * Error during handler execution.
 */
export interface ExecutionErrorEvent {
  type: 'execution:error';
  requestId: string;
  executionId: string;
  code: string;
  message: string;
  retryable: boolean;
  attempt?: number;
  maxAttempts?: number;
}

/**
 * Execution is being retried after a failure (CC3).
 * Emitted between attempts.
 */
export interface ExecutionRetryEvent {
  type: 'execution:retry';
  requestId: string;
  executionId: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: string;
}

/**
 * Execution was cancelled (CC2).
 * Emitted before execution:done with exitCode 130.
 */
export interface ExecutionCancelledEvent {
  type: 'execution:cancelled';
  requestId: string;
  executionId: string;
  reason: string;
  durationMs: number;
}

/**
 * Handler execution completed (success or failure).
 */
export interface ExecutionDoneEvent {
  type: 'execution:done';
  requestId: string;
  executionId: string;
  exitCode: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Event emitter interface for execution pipeline.
 * Backend calls emit(), Gateway translates to subscribers.
 */
export interface IExecutionEventEmitter {
  emit(event: ExecutionEvent): void;
  onEvent(handler: (event: ExecutionEvent) => void): () => void;
}
