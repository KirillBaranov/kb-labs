/**
 * @module @kb-labs/core-resource-broker/retry/error-classifier
 * Error classification for retry logic.
 */

import type { ErrorType } from '../types.js';
import { classifyFailure } from '@kb-labs/core-retry';

/**
 * Classify an error for retry decision.
 *
 * @param error - Error to classify
 * @returns Error type classification
 */
export function classifyError(error: unknown): ErrorType {
  const kind = classifyFailure(error, { source: 'transport' }).kind;
  if (kind === 'rate_limit') {return 'rate_limit';}
  if (kind === 'timeout') {return 'timeout';}
  if (kind === 'network') {return 'network';}
  if (kind === 'server') {return 'server_error';}
  if (kind === 'validation' || kind === 'authentication' || kind === 'authorization' || kind === 'not_found') {return 'client_error';}
  return 'unknown';
}

/**
 * Check if an error is a rate limit error (429).
 */
export function isRateLimitError(error: unknown): boolean {
  return classifyError(error) === 'rate_limit';
}

/**
 * Check if an error is retryable.
 *
 * @param error - Error to check
 * @param retryableTypes - Types that should be retried
 */
export function isRetryableError(
  error: unknown,
  retryableTypes: ErrorType[] = ['rate_limit', 'server_error', 'timeout', 'network']
): boolean {
  const errorType = classifyError(error);
  return retryableTypes.includes(errorType);
}

/**
 * Extract retry-after hint from error if available.
 *
 * @param error - Error to extract hint from
 * @returns Milliseconds to wait, or undefined
 */
export function extractRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const obj = error as Record<string, unknown>;

  // Check common retry-after locations
  const retryAfter =
    obj.retryAfter ??
    obj['retry-after'] ??
    obj.retryAfterMs ??
    (obj.headers as Record<string, unknown> | undefined)?.['retry-after'];

  if (typeof retryAfter === 'number') {
    // If less than 1000, assume it's seconds
    return retryAfter < 1000 ? retryAfter * 1000 : retryAfter;
  }

  if (typeof retryAfter === 'string') {
    const parsed = parseInt(retryAfter, 10);
    if (!isNaN(parsed)) {
      // If less than 1000, assume it's seconds
      return parsed < 1000 ? parsed * 1000 : parsed;
    }
  }

  return undefined;
}
