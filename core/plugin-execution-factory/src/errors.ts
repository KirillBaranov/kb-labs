/**
 * @module @kb-labs/plugin-execution/errors
 *
 * Error classes for execution layer.
 *
 * IMPORTANT: Class is named ExecutionLayerError to avoid conflict with
 * ExecutionError interface in types.ts. This is intentional.
 */

import type { ExecutionErrorCode, ExecutionError } from './types.js';

/**
 * All known error codes for type guards.
 */
const KNOWN_ERROR_CODES: Set<ExecutionErrorCode> = new Set([
  // Phase 1: Core codes
  'TIMEOUT',
  'ABORTED',
  'PERMISSION_DENIED',
  'HANDLER_ERROR',
  'HANDLER_CONTRACT_ERROR',
  'HANDLER_NOT_FOUND',
  'WORKSPACE_ERROR',
  'VALIDATION_ERROR',
  'UNKNOWN_ERROR',
  // Phase 2: Pool-specific codes
  'QUEUE_FULL',
  'ACQUIRE_TIMEOUT',
  'WORKER_CRASHED',
  'WORKER_UNHEALTHY',
]);

/**
 * Type guard for ExecutionErrorCode.
 */
export function isKnownErrorCode(code: unknown): code is ExecutionErrorCode {
  return typeof code === 'string' && KNOWN_ERROR_CODES.has(code as ExecutionErrorCode);
}

/**
 * Base execution layer error.
 *
 * Named ExecutionLayerError (not ExecutionError) to avoid
 * collision with ExecutionError interface in types.ts.
 */
export class ExecutionLayerError extends Error {
  readonly code: ExecutionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ExecutionErrorCode = 'UNKNOWN_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExecutionLayerError';
    this.code = code;
    this.details = details;
  }

  /**
   * Convert to ExecutionError interface for serialization.
   */
  toJSON(): ExecutionError {
    return {
      message: this.message,
      code: this.code,
      stack: this.stack,
      details: this.details,
    };
  }
}

/**
 * Type guard for ExecutionLayerError.
 */
export function isExecutionLayerError(error: unknown): error is ExecutionLayerError {
  return error instanceof ExecutionLayerError;
}

/**
 * Handler execution timed out.
 */
export class TimeoutError extends ExecutionLayerError {
  readonly timeoutMs?: number;

  constructor(message: string, timeoutMs?: number) {
    super(message, 'TIMEOUT', { timeoutMs });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execution was aborted via signal.
 */
export class AbortError extends ExecutionLayerError {
  constructor(message = 'Execution aborted') {
    super(message, 'ABORTED');
    this.name = 'AbortError';
  }
}

/**
 * Handler contract violation (no execute function, etc.)
 */
export class HandlerContractError extends ExecutionLayerError {
  constructor(message: string) {
    super(message, 'HANDLER_CONTRACT_ERROR');
    this.name = 'HandlerContractError';
  }
}

/**
 * Handler file not found.
 */
export class HandlerNotFoundError extends ExecutionLayerError {
  readonly handlerPath: string;

  constructor(handlerPath: string) {
    super(`Handler not found: ${handlerPath}`, 'HANDLER_NOT_FOUND', { handlerPath });
    this.name = 'HandlerNotFoundError';
    this.handlerPath = handlerPath;
  }
}

/**
 * Workspace error (failed to lease, access, etc.)
 */
export class WorkspaceError extends ExecutionLayerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKSPACE_ERROR', details);
    this.name = 'WorkspaceError';
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends ExecutionLayerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', details);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Validation error (input/output schema violation).
 */
export class ValidationError extends ExecutionLayerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Phase 2: Pool-specific errors
// ============================================================================

/**
 * Queue is full - 429 response.
 * New requests should be rejected when queue is at capacity.
 */
export class QueueFullError extends ExecutionLayerError {
  readonly queueSize: number;
  readonly maxQueueSize: number;

  constructor(queueSize: number, maxQueueSize: number) {
    super(
      `Queue full: ${queueSize}/${maxQueueSize} requests pending`,
      'QUEUE_FULL',
      { queueSize, maxQueueSize }
    );
    this.name = 'QueueFullError';
    this.queueSize = queueSize;
    this.maxQueueSize = maxQueueSize;
  }
}

/**
 * No worker became available within timeout - 503 response.
 */
export class AcquireTimeoutError extends ExecutionLayerError {
  readonly acquireTimeoutMs: number;

  constructor(acquireTimeoutMs: number) {
    super(
      `No worker available within ${acquireTimeoutMs}ms`,
      'ACQUIRE_TIMEOUT',
      { acquireTimeoutMs }
    );
    this.name = 'AcquireTimeoutError';
    this.acquireTimeoutMs = acquireTimeoutMs;
  }
}

/**
 * Worker process crashed unexpectedly - 500 response.
 */
export class WorkerCrashedError extends ExecutionLayerError {
  readonly workerId: string;
  readonly exitCode?: number;
  readonly signal?: string;

  constructor(workerId: string, exitCode?: number, signal?: string) {
    super(
      `Worker ${workerId} crashed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}${signal ? ` (signal: ${signal})` : ''}`,
      'WORKER_CRASHED',
      { workerId, exitCode, signal }
    );
    this.name = 'WorkerCrashedError';
    this.workerId = workerId;
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

/**
 * Worker is unhealthy - 503 response.
 * Worker may be stuck, unresponsive, or failed health check.
 */
export class WorkerUnhealthyError extends ExecutionLayerError {
  readonly workerId: string;
  readonly reason: string;

  constructor(workerId: string, reason: string) {
    super(
      `Worker ${workerId} is unhealthy: ${reason}`,
      'WORKER_UNHEALTHY',
      { workerId, reason }
    );
    this.name = 'WorkerUnhealthyError';
    this.workerId = workerId;
    this.reason = reason;
  }
}
