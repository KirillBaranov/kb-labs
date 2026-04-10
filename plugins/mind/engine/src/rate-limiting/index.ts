/**
 * @module @kb-labs/mind-engine/rate-limiting
 *
 * Provider-agnostic rate limiting for embedding APIs.
 */

export {
  type RateLimitConfig,
  type RateLimitPreset,
  RATE_LIMIT_PRESETS,
  getRateLimitConfig,
  estimateTokens,
  estimateBatchTokens,
} from './rate-limit-config';

export {
  RateLimiter,
  createRateLimiter,
  type RateLimiterStats,
} from './rate-limiter';
