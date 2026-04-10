/**
 * @module @kb-labs/core-contracts/retry
 *
 * Three retry levels (CC3):
 *
 * Level 1 (transport) — transparent, in HTTP/WS transport layer.
 *   Retries on 503, network errors. Client doesn't know.
 *
 * Level 2 (execution) — configurable in ExecutionConfig.retry.
 *   Wraps backend.execute() with retry + backoff.
 *   Emits execution:retry events between attempts.
 *
 * Level 3 (checkpoint) — opt-in, implemented by handler.
 *   Handler saves progress via ctx.checkpoint, resumes on retry.
 */

/**
 * Error classification for retry decisions.
 */
export interface RetryableError {
  code: string;
  message: string;
  /** Whether the error is safe to retry */
  retryable: boolean;
}

/**
 * Level 2: Execution retry policy.
 * Determines whether to retry and with what delay.
 */
export interface IRetryPolicy {
  /** Maximum number of attempts (including first try). */
  maxAttempts: number;
  /** Whether this error should be retried. */
  shouldRetry(error: RetryableError, attempt: number): boolean;
  /** Delay in ms before next attempt (for backoff). */
  getDelay(attempt: number): number;
}

/**
 * Level 3: Checkpoint interface for handler-level resume.
 * Available via ctx.checkpoint in handler execution context.
 */
export interface ICheckpointContext {
  /** Get last saved checkpoint data. */
  getCheckpoint<T = unknown>(): Promise<T | null>;
  /** Save checkpoint (survives retries, cleared on success). */
  saveCheckpoint<T = unknown>(data: T): Promise<void>;
  /** Clear checkpoint (call on successful completion). */
  clearCheckpoint(): Promise<void>;
}

/**
 * Retry configuration for ExecutionConfig.
 */
export interface ExecutionRetryConfig {
  /** Maximum attempts (including first try). @default 1 (no retry) */
  maxAttempts?: number;
  /** Initial delay between retries in ms. @default 1000 */
  initialDelayMs?: number;
  /** Backoff multiplier. @default 2 */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms. @default 30000 */
  maxDelayMs?: number;
  /** Only retry errors with retryable=true. @default true */
  onlyRetryable?: boolean;
}
