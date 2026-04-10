/**
 * @module @kb-labs/mind-engine/rate-limiting/rate-limit-config
 *
 * Provider-agnostic rate limiting configuration.
 * Supports different providers: OpenAI, Sber, local models, etc.
 */

/**
 * Rate limiting configuration for embedding providers.
 * Different providers have different rate limits and strategies.
 */
export interface RateLimitConfig {
  /**
   * Tokens per minute limit (e.g., OpenAI TPM)
   * If undefined, no token-based rate limiting is applied
   */
  tokensPerMinute?: number;

  /**
   * Requests per minute limit (e.g., OpenAI RPM)
   * If undefined, no request-per-minute rate limiting is applied
   */
  requestsPerMinute?: number;

  /**
   * Requests per second limit
   * Some APIs (like Sber) use RPS instead of RPM
   */
  requestsPerSecond?: number;

  /**
   * Maximum tokens per single request
   * Provider-specific limit
   */
  maxTokensPerRequest?: number;

  /**
   * Maximum number of inputs (texts) per batch request
   * Provider-specific limit
   */
  maxInputsPerRequest?: number;

  /**
   * Maximum concurrent requests
   * For local models - GPU/CPU concurrency limit
   */
  maxConcurrentRequests?: number;

  /**
   * Strategy when rate limit is reached
   * - 'wait': Wait until capacity is available (default)
   * - 'backoff': Exponential backoff on rate limit errors
   * - 'queue': Queue requests and process them as capacity becomes available
   */
  strategy?: 'wait' | 'backoff' | 'queue';

  /**
   * Safety margin (0-1, default 0.9)
   * Use only X% of the limit to avoid hitting exact boundaries
   */
  safetyMargin?: number;
}

/**
 * Pre-configured rate limits for common providers
 */
export const RATE_LIMIT_PRESETS = {
  /**
   * OpenAI Tier 1 (paid accounts, entry level)
   * https://platform.openai.com/docs/guides/rate-limits
   * Updated Nov 2024: Tier 1 now has 1M TPM for embeddings
   */
  'openai-tier-1': {
    tokensPerMinute: 1_000_000,
    requestsPerMinute: 3000,
    maxTokensPerRequest: 8191,
    maxInputsPerRequest: 2048,
    strategy: 'wait',
    safetyMargin: 0.85, // More conservative to avoid edge cases
  } as RateLimitConfig,

  /**
   * OpenAI Tier 2 (after $50+ spent)
   */
  'openai-tier-2': {
    tokensPerMinute: 2_000_000,
    requestsPerMinute: 5000,
    maxTokensPerRequest: 8191,
    maxInputsPerRequest: 2048,
    strategy: 'wait',
    safetyMargin: 0.9,
  } as RateLimitConfig,

  /**
   * OpenAI Tier 3
   */
  'openai-tier-3': {
    tokensPerMinute: 5_000_000,
    requestsPerMinute: 5000,
    maxTokensPerRequest: 8191,
    maxInputsPerRequest: 2048,
    strategy: 'wait',
    safetyMargin: 0.9,
  } as RateLimitConfig,

  /**
   * OpenAI Tier 4
   */
  'openai-tier-4': {
    tokensPerMinute: 10_000_000,
    requestsPerMinute: 10000,
    maxTokensPerRequest: 8191,
    maxInputsPerRequest: 2048,
    strategy: 'wait',
    safetyMargin: 0.9,
  } as RateLimitConfig,

  /**
   * OpenAI Tier 5 (enterprise)
   */
  'openai-tier-5': {
    tokensPerMinute: 50_000_000,
    requestsPerMinute: 10000,
    maxTokensPerRequest: 8191,
    maxInputsPerRequest: 2048,
    strategy: 'wait',
    safetyMargin: 0.9,
  } as RateLimitConfig,

  /**
   * Sber GigaChat API
   * Conservative limits for typical access
   */
  'sber-gigachat': {
    requestsPerMinute: 100,
    requestsPerSecond: 5,
    maxInputsPerRequest: 100,
    strategy: 'backoff',
    safetyMargin: 0.8,
  } as RateLimitConfig,

  /**
   * Yandex GPT API
   */
  'yandex-gpt': {
    requestsPerMinute: 100,
    requestsPerSecond: 10,
    maxInputsPerRequest: 50,
    strategy: 'backoff',
    safetyMargin: 0.8,
  } as RateLimitConfig,

  /**
   * Local Ollama
   * No external rate limits, only GPU concurrency
   */
  'ollama-local': {
    maxConcurrentRequests: 4,
    maxInputsPerRequest: 100,
    strategy: 'queue',
  } as RateLimitConfig,

  /**
   * Self-hosted vLLM
   */
  'vllm-local': {
    maxConcurrentRequests: 8,
    requestsPerSecond: 100,
    maxInputsPerRequest: 256,
    strategy: 'queue',
  } as RateLimitConfig,

  /**
   * Self-hosted text-embeddings-inference
   */
  'tei-local': {
    maxConcurrentRequests: 16,
    maxInputsPerRequest: 256,
    strategy: 'queue',
  } as RateLimitConfig,

  /**
   * No rate limiting (for testing or unlimited APIs)
   */
  'unlimited': {
    strategy: 'wait',
  } as RateLimitConfig,
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

/**
 * Get rate limit config from preset name or custom config
 */
export function getRateLimitConfig(
  configOrPreset: RateLimitConfig | RateLimitPreset | undefined
): RateLimitConfig {
  if (!configOrPreset) {
    // Default: OpenAI Tier 2 (most common for paid accounts)
    return RATE_LIMIT_PRESETS['openai-tier-2'];
  }

  if (typeof configOrPreset === 'string') {
    const preset = RATE_LIMIT_PRESETS[configOrPreset];
    if (!preset) {
      throw new Error(`Unknown rate limit preset: ${configOrPreset}`);
    }
    return preset;
  }

  return configOrPreset;
}

/**
 * Estimate tokens for a text (rough approximation)
 * Uses ~4 characters per token as a conservative estimate
 */
export function estimateTokens(text: string): number {
  // GPT tokenizers average ~4 chars per token for English
  // Use 3.5 to be more conservative (slightly overestimate)
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate tokens for multiple texts
 */
export function estimateBatchTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokens(text), 0);
}
