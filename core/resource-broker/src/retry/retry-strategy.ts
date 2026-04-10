/**
 * @module @kb-labs/core-resource-broker/retry/retry-strategy
 * Exponential backoff retry strategy with jitter.
 */

import type { RetryConfig, ErrorType } from '../types.js';
import { DEFAULT_RETRY_CONFIG } from '../types.js';
import { classifyError, extractRetryAfter, isRetryableError } from './error-classifier.js';

/**
 * Result of a retry decision.
 */
export interface RetryDecision {
  /** Whether to retry */
  shouldRetry: boolean;

  /** Delay before retry (ms) */
  delayMs: number;

  /** Error classification */
  errorType: ErrorType;

  /** Current attempt number (0-indexed) */
  attempt: number;

  /** Maximum attempts allowed */
  maxAttempts: number;
}

/**
 * Calculate delay with exponential backoff and jitter.
 *
 * Formula: min(maxDelay, baseDelay * 2^attempt) * (1 + random * jitter)
 *
 * @param attempt - Current attempt (0-indexed)
 * @param config - Retry configuration
 * @param retryAfterHint - Optional retry-after hint from error (ms)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  retryAfterHint?: number
): number {
  // If we have a retry-after hint, use it (but cap at maxDelay)
  if (retryAfterHint !== undefined && retryAfterHint > 0) {
    return Math.min(retryAfterHint, config.maxDelay);
  }

  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  // Add jitter: delay * (1 + random * jitter)
  const jitterMultiplier = 1 + Math.random() * config.jitter;

  return Math.floor(cappedDelay * jitterMultiplier);
}

/**
 * Decide whether to retry based on error and attempt count.
 *
 * @param error - The error that occurred
 * @param attempt - Current attempt (0-indexed)
 * @param config - Retry configuration
 * @returns Retry decision with delay
 *
 * @example
 * ```typescript
 * const decision = shouldRetry(error, 0, config);
 *
 * if (decision.shouldRetry) {
 *   await sleep(decision.delayMs);
 *   // retry...
 * } else {
 *   throw error;
 * }
 * ```
 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  config: Partial<RetryConfig> = {}
): RetryDecision {
  const fullConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  const errorType = classifyError(error);
  const isRetryable = isRetryableError(error, fullConfig.retryableErrors);
  const hasAttemptsLeft = attempt < fullConfig.maxRetries;

  const shouldRetryNow = isRetryable && hasAttemptsLeft;

  // Calculate delay only if we're going to retry
  let delayMs = 0;
  if (shouldRetryNow) {
    const retryAfterHint = extractRetryAfter(error);

    // For rate limit errors, use longer base delay
    if (errorType === 'rate_limit') {
      const rateLimitConfig: RetryConfig = {
        ...fullConfig,
        baseDelay: Math.max(fullConfig.baseDelay, 5000), // At least 5s for rate limits
      };
      delayMs = calculateBackoffDelay(attempt, rateLimitConfig, retryAfterHint);
    } else {
      delayMs = calculateBackoffDelay(attempt, fullConfig, retryAfterHint);
    }
  }

  return {
    shouldRetry: shouldRetryNow,
    delayMs,
    errorType,
    attempt,
    maxAttempts: fullConfig.maxRetries,
  };
}

/**
 * Execute a function with retry logic.
 *
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     return await llm.complete(prompt);
 *   },
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<{ result: T; attempts: number }> {
  const fullConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    attempts = attempt + 1;

    try {
      const result = await fn();
      return { result, attempts };
    } catch (error) {
      lastError = error;

      const decision = shouldRetry(error, attempt, fullConfig);

      if (!decision.shouldRetry) {
        break;
      }

      // Wait before retry
      await sleep(decision.delayMs);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * Create a retry configuration for rate-limited APIs.
 *
 * @param maxRetries - Maximum retry attempts (default: 5)
 * @returns Retry config optimized for rate limits
 */
export function createRateLimitRetryConfig(maxRetries = 5): RetryConfig {
  return {
    maxRetries,
    baseDelay: 5000, // Start with 5s for rate limits
    maxDelay: 60000, // Cap at 1 minute
    jitter: 0.2, // 20% jitter for distributed systems
    retryableErrors: ['rate_limit', 'server_error', 'timeout', 'network'],
  };
}

/**
 * Create a retry configuration for quick operations.
 *
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Retry config with fast retries
 */
export function createQuickRetryConfig(maxRetries = 3): RetryConfig {
  return {
    maxRetries,
    baseDelay: 500, // Start with 500ms
    maxDelay: 5000, // Cap at 5s
    jitter: 0.1, // 10% jitter
    retryableErrors: ['server_error', 'timeout', 'network'],
  };
}
