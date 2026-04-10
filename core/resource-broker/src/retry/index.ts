/**
 * @module @kb-labs/core-resource-broker/retry
 * Retry strategies and error classification.
 */

export {
  classifyError,
  isRateLimitError,
  isRetryableError,
  extractRetryAfter,
} from './error-classifier.js';

export {
  shouldRetry,
  withRetry,
  calculateBackoffDelay,
  sleep,
  createRateLimitRetryConfig,
  createQuickRetryConfig,
  type RetryDecision,
} from './retry-strategy.js';
