/**
 * @module @kb-labs/adapters-qdrant/retry
 * Exponential-backoff retry logic for transient Qdrant errors.
 *
 * Retryable error codes / status codes:
 *   - ECONNREFUSED  – Qdrant not yet reachable (startup, restart)
 *   - ETIMEDOUT     – network or request timeout
 *   - ECONNRESET    – connection reset by peer (proxy / load-balancer glitch)
 *   - ENOTFOUND     – DNS hiccup (transient in cloud environments)
 *   - HTTP 503      – Service Unavailable (Qdrant overloaded / restarting)
 *   - HTTP 429      – Too Many Requests (rate-limited; also worth retrying)
 *   - HTTP 502 / 504 – upstream gateway errors (common behind a proxy)
 */

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /**
   * Maximum number of *attempts* (first call + retries).
   * @default 4
   */
  maxAttempts?: number;

  /**
   * Base delay in milliseconds between attempts.
   * Actual delay = `baseDelayMs * 2^(attempt - 1)` + jitter.
   * @default 200
   */
  baseDelayMs?: number;

  /**
   * Maximum delay cap in milliseconds (prevents runaway back-off).
   * @default 10_000
   */
  maxDelayMs?: number;

  /**
   * Extra predicate called after built-in checks.
   * Return `true` to treat the error as retryable.
   */
  isRetryable?: (error: unknown) => boolean;

  /**
   * Optional callback invoked before each retry sleep.
   * Useful for logging / metrics.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** @internal The set of retryable Node.js `syscall` / `code` strings. */
const RETRYABLE_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EPIPE",
  "ECONNABORTED",
]);

/** @internal HTTP status codes that are safe to retry. */
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Determine whether `error` represents a transient, retryable failure.
 *
 * Checks:
 *  1. Node.js network error codes (`error.code`)
 *  2. HTTP response status (`error.status`, `error.statusCode`,
 *     `error.response?.status`)
 *  3. Error message substrings as a last resort
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // 1. Node.js network error codes
  const code = (error as NodeJS.ErrnoException).code;
  if (code && RETRYABLE_CODES.has(code)) {
    return true;
  }

  // 2. HTTP status codes  (Qdrant JS client surfaces these in different ways)
  const anyErr = error as unknown as Record<string, unknown>;

  const status =
    (typeof anyErr["status"] === "number" ? anyErr["status"] : undefined) ??
    (typeof anyErr["statusCode"] === "number"
      ? anyErr["statusCode"]
      : undefined) ??
    (typeof (anyErr["response"] as Record<string, unknown> | undefined)?.[
      "status"
    ] === "number"
      ? ((anyErr["response"] as Record<string, unknown>)["status"] as number)
      : undefined);

  if (typeof status === "number" && RETRYABLE_HTTP_STATUSES.has(status)) {
    return true;
  }

  // 3. Message substrings (fallback for environments that don't expose codes)
  const msg = error.message.toLowerCase();
  if (
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("service unavailable") ||
    msg.includes("503")
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep for `ms` milliseconds.
 * @internal
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Compute the delay before the next attempt using full-jitter exponential
 * back-off: `random(0, min(cap, base * 2^attempt))`.
 * @internal
 */
function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  // attempt is 0-indexed here (0 = first retry after the initial failure)
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: uniform in [0, capped]
  return Math.floor(Math.random() * capped);
}

/**
 * Wrap an async operation with exponential-backoff retry on transient errors.
 *
 * Only errors identified as transient (ECONNREFUSED, ETIMEDOUT, 503, etc.)
 * are retried.  All other errors are re-thrown immediately.
 *
 * @param fn         The async operation to execute.
 * @param options    Retry configuration.
 * @returns          The resolved value of `fn`.
 * @throws           The last error if all attempts are exhausted, or the
 *                   first non-transient error encountered.
 *
 * @example
 * ```ts
 * const results = await withRetry(
 *   () => this.client.search(this.collectionName, params),
 *   { maxAttempts: 4, baseDelayMs: 200, maxDelayMs: 10_000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const { isRetryable: extraIsRetryable, onRetry } = options;

  if (maxAttempts < 1) {
    throw new RangeError(`maxAttempts must be >= 1, got ${maxAttempts}`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable =
        isTransientError(error) || (extraIsRetryable?.(error) ?? false);

      // Non-transient error — rethrow immediately without retrying
      if (!retryable) {
        throw error;
      }

      // Last attempt exhausted — rethrow
      if (attempt >= maxAttempts) {
        break;
      }

      // Compute backoff delay (attempt - 1 = retry index)
      const delayMs = computeDelay(attempt - 1, baseDelayMs, maxDelayMs);

      onRetry?.(error, attempt, delayMs);

      await sleep(delayMs);
    }
  }

  throw lastError;
}
