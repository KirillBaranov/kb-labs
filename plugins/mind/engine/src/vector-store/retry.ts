/**
 * @module @kb-labs/mind-engine/vector-store/retry
 * Exponential-backoff retry helper for transient vector-store errors.
 *
 * Transient errors that trigger a retry:
 *   - ECONNREFUSED  – Qdrant is starting up or temporarily unreachable
 *   - ETIMEDOUT     – network / socket timeout
 *   - HTTP 503      – service unavailable (overloaded / deploying)
 *
 * All other errors are considered permanent and propagate immediately.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (initial + retries). Default: 4 */
  maxAttempts?: number;
  /** Base delay in milliseconds before the first retry. Default: 100 */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 5_000 */
  maxDelayMs?: number;
  /** Jitter factor [0, 1] applied to each delay to spread retries. Default: 0.2 */
  jitter?: number;
}

interface RetryContext {
  attempt: number;       // 1-based current attempt number
  maxAttempts: number;
  error: unknown;
}

// ---------------------------------------------------------------------------
// Transient-error detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the error is likely transient and safe to retry.
 *
 * Checks (in order):
 *  1. Node.js `code` property — ECONNREFUSED, ETIMEDOUT, ECONNRESET, ENOTFOUND (DNS blip)
 *  2. HTTP status code on `error.status` or `error.statusCode` — 429, 502, 503, 504
 *  3. Serialised message containing the same keywords (fallback for wrapped errors)
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  // 1. Node.js system-error codes
  const TRANSIENT_CODES = new Set([
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
  ]);

  if (typeof err['code'] === 'string' && TRANSIENT_CODES.has(err['code'])) {
    return true;
  }

  // 2. HTTP status codes
  const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

  const httpStatus =
    typeof err['status'] === 'number'
      ? err['status']
      : typeof err['statusCode'] === 'number'
        ? err['statusCode']
        : null;

  if (httpStatus !== null && TRANSIENT_STATUSES.has(httpStatus)) {
    return true;
  }

  // 3. Message heuristics (covers wrapped / serialised errors)
  const message =
    typeof err['message'] === 'string' ? err['message'].toLowerCase() : '';

  const TRANSIENT_KEYWORDS = [
    'econnrefused',
    'etimedout',
    'econnreset',
    'connection refused',
    'connection timed out',
    'socket hang up',
    'service unavailable',
    '503',
  ];

  return TRANSIENT_KEYWORDS.some(kw => message.includes(kw));
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the delay (ms) before the next attempt using full-jitter
 * exponential backoff: `delay = random(0, min(cap, base * 2^attempt)) `.
 */
export function calculateBackoffMs(
  attempt: number,       // 0-based retry count (0 = after 1st failure)
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);

  // Apply jitter: spread around [capped * (1 - jitter), capped]
  const spread = capped * jitter;
  return Math.round(capped - spread + Math.random() * spread * 2);
}

// ---------------------------------------------------------------------------
// Core retry wrapper
// ---------------------------------------------------------------------------

/**
 * Executes `fn` up to `maxAttempts` times, retrying only on transient errors.
 *
 * @param fn         Async function to execute (receives `RetryContext` for logging)
 * @param options    Retry configuration
 * @returns          Resolved value of `fn`
 * @throws           The last error if all attempts are exhausted, or any
 *                   non-transient error on the first occurrence.
 *
 * @example
 * ```ts
 * const results = await withRetry(
 *   () => qdrant.search(vector, limit, filter),
 *   { maxAttempts: 4, baseDelayMs: 100 },
 * );
 * ```
 */
export async function withRetry<T>(
  fn: (ctx: RetryContext) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const jitter = Math.max(0, Math.min(1, options.jitter ?? 0.2));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn({ attempt, maxAttempts, error: lastError });
    } catch (error) {
      lastError = error;

      // Permanent error — propagate immediately, no retry
      if (!isTransientError(error)) {
        throw error;
      }

      // Final attempt exhausted
      if (attempt === maxAttempts) {
        break;
      }

      // Wait before next retry (attempt - 1 so the first retry uses base delay)
      const delay = calculateBackoffMs(attempt - 1, baseDelayMs, maxDelayMs, jitter);
      await sleep(delay);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}
