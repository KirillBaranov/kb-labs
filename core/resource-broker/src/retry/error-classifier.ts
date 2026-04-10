/**
 * @module @kb-labs/core-resource-broker/retry/error-classifier
 * Error classification for retry logic.
 */

import type { ErrorType } from '../types.js';

/**
 * Classify an error for retry decision.
 *
 * @param error - Error to classify
 * @returns Error type classification
 */
export function classifyError(error: unknown): ErrorType {
  if (!error) {
    return 'unknown';
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Rate limit errors (429)
    if (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      name.includes('ratelimit')
    ) {
      return 'rate_limit';
    }

    // Timeout errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      message.includes('deadline exceeded') ||
      name.includes('timeout')
    ) {
      return 'timeout';
    }

    // Network errors
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('socket') ||
      message.includes('dns') ||
      name.includes('fetch') ||
      name.includes('network')
    ) {
      return 'network';
    }

    // Server errors (5xx)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return 'server_error';
    }

    // Client errors (4xx except 429)
    if (
      message.includes('400') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('404') ||
      message.includes('bad request') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found')
    ) {
      return 'client_error';
    }
  }

  // Handle response-like objects with status codes
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;

    // Check status code
    const status = obj.status ?? obj.statusCode ?? obj.code;
    if (typeof status === 'number') {
      if (status === 429) {return 'rate_limit';}
      if (status >= 500) {return 'server_error';}
      if (status >= 400) {return 'client_error';}
    }

    // Check error code string
    const code = obj.code;
    if (typeof code === 'string') {
      const lowerCode = code.toLowerCase();
      if (lowerCode.includes('timeout')) {return 'timeout';}
      if (lowerCode.includes('econnrefused')) {return 'network';}
      if (lowerCode.includes('econnreset')) {return 'network';}
      if (lowerCode.includes('enotfound')) {return 'network';}
    }
  }

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
