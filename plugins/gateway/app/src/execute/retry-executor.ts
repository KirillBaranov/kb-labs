/**
 * @module gateway-app/execute/retry-executor
 *
 * Level 2 retry wrapper for execution dispatch (CC3).
 *
 * Wraps a dispatch function with configurable retry + exponential backoff.
 * Emits execution:retry events between attempts so clients see progress.
 * Respects AbortSignal — cancels immediately, no retry after abort.
 *
 * Each attempt is raced against the AbortSignal so that a cancelled
 * execution doesn't block on a hung dispatcher call.
 */

import type { ExecutionRetryConfig, CancellationReason } from '@kb-labs/core-contracts';
import type { ExecutionEventMessage } from '@kb-labs/gateway-contracts';
import { CancelledError } from './errors.js';

const DEFAULTS: Required<ExecutionRetryConfig> = {
  maxAttempts: 1,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
  onlyRetryable: true,
};

export interface RetryContext {
  executionId: string;
  requestId: string;
  signal: AbortSignal;
  config: ExecutionRetryConfig | undefined;
  /** Emit event to client stream (and WS subscribers via routes.ts). */
  write: (event: ExecutionEventMessage) => void;
}

/**
 * Execute dispatch function with retry + abort-race logic.
 *
 * - maxAttempts=1 (default) → single call, raced against signal.
 * - maxAttempts>1 → retry loop with backoff, each attempt raced against signal.
 */
export async function executeWithRetry<T>(
  ctx: RetryContext,
  dispatch: () => Promise<T>,
): Promise<T> {
  const cfg = { ...DEFAULTS, ...ctx.config };
  const maxAttempts = Math.max(1, cfg.maxAttempts);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctx.signal.aborted) {
      throw new CancelledError(ctx.signal.reason as CancellationReason);
    }

    try {
      return await raceAbort(ctx.signal, dispatch());
    } catch (err) {
      // Cancellation is never retried
      if (err instanceof CancelledError) { throw err; }

      lastError = err instanceof Error ? err : new Error(String(err));

      // Last attempt — propagate error
      if (attempt >= maxAttempts) { break; }

      // Check if error is retryable
      const classified = classifyError(err);
      if (cfg.onlyRetryable && !classified.retryable) { break; }

      // Backoff delay
      const delay = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs,
      );

      ctx.write({
        type: 'execution:retry',
        requestId: ctx.requestId,
        executionId: ctx.executionId,
        attempt,
        maxAttempts,
        delayMs: delay,
        error: classified.message,
      } satisfies ExecutionEventMessage);

      await interruptibleDelay(delay, ctx.signal);
    }
  }

  throw lastError ?? new Error('executeWithRetry: no attempts made');
}

// ── Internals ──

/**
 * Race a promise against an AbortSignal.
 */
function raceAbort<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new CancelledError(signal.reason as CancellationReason));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CancelledError(signal.reason as CancellationReason));
    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

/**
 * Sleep interruptible by AbortSignal.
 */
function interruptibleDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new CancelledError(signal.reason as CancellationReason));
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError(signal.reason as CancellationReason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface ClassifiedError {
  code: string;
  message: string;
  retryable: boolean;
}

function classifyError(err: unknown): ClassifiedError {
  if (!(err instanceof Error)) {
    return { code: 'UNKNOWN', message: String(err), retryable: false };
  }

  const msg = err.message;

  // Transport / network — retryable
  if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') || msg.includes('timed out') ||
      msg.includes('503') || msg.includes('Service Unavailable')) {
    return { code: 'TRANSPORT_ERROR', message: msg, retryable: true };
  }

  // Host went offline — retryable (may reconnect)
  if (msg.includes('Host not connected')) {
    return { code: 'HOST_UNAVAILABLE', message: msg, retryable: true };
  }

  // Everything else — not retryable
  return { code: 'HANDLER_ERROR', message: msg, retryable: false };
}
