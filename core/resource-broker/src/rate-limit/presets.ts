/**
 * @module @kb-labs/core-resource-broker/rate-limit/presets
 * Pre-configured rate limits for common providers.
 */

import type { RateLimitConfig } from '../types.js';

/**
 * Pre-configured rate limits for common providers.
 */
export const RATE_LIMIT_PRESETS = {
  // ═══════════════════════════════════════════════════════════════════════════
  // OPENAI
  // https://platform.openai.com/docs/guides/rate-limits
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * OpenAI Tier 1 (paid accounts, entry level)
   * Updated Nov 2024: Tier 1 now has 1M TPM for embeddings
   */
  'openai-tier-1': {
    tokensPerMinute: 1_000_000,
    requestsPerMinute: 3000,
    maxTokensPerRequest: 8191,
    safetyMargin: 0.85, // More conservative to avoid edge cases
  } satisfies RateLimitConfig,

  /**
   * OpenAI Tier 2 (after $50+ spent)
   */
  'openai-tier-2': {
    tokensPerMinute: 2_000_000,
    requestsPerMinute: 5000,
    maxTokensPerRequest: 8191,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * OpenAI Tier 3
   */
  'openai-tier-3': {
    tokensPerMinute: 5_000_000,
    requestsPerMinute: 5000,
    maxTokensPerRequest: 8191,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * OpenAI Tier 4
   */
  'openai-tier-4': {
    tokensPerMinute: 10_000_000,
    requestsPerMinute: 10000,
    maxTokensPerRequest: 8191,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * OpenAI Tier 5 (enterprise)
   */
  'openai-tier-5': {
    tokensPerMinute: 50_000_000,
    requestsPerMinute: 10000,
    maxTokensPerRequest: 8191,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * OpenAI GPT-4 specific limits (more restrictive)
   */
  'openai-gpt4': {
    tokensPerMinute: 150_000,
    requestsPerMinute: 500,
    maxTokensPerRequest: 8192,
    safetyMargin: 0.85,
  } satisfies RateLimitConfig,

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTHROPIC
  // https://docs.anthropic.com/en/api/rate-limits
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Anthropic Tier 1 (default)
   */
  'anthropic-tier-1': {
    tokensPerMinute: 40_000,
    requestsPerMinute: 50,
    maxTokensPerRequest: 4096,
    safetyMargin: 0.85,
  } satisfies RateLimitConfig,

  /**
   * Anthropic Tier 2
   */
  'anthropic-tier-2': {
    tokensPerMinute: 80_000,
    requestsPerMinute: 100,
    maxTokensPerRequest: 4096,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * Anthropic Tier 3
   */
  'anthropic-tier-3': {
    tokensPerMinute: 160_000,
    requestsPerMinute: 200,
    maxTokensPerRequest: 4096,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  /**
   * Anthropic Tier 4
   */
  'anthropic-tier-4': {
    tokensPerMinute: 400_000,
    requestsPerMinute: 400,
    maxTokensPerRequest: 4096,
    safetyMargin: 0.9,
  } satisfies RateLimitConfig,

  // ═══════════════════════════════════════════════════════════════════════════
  // RUSSIAN PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sber GigaChat API
   * Conservative limits for typical access
   */
  'sber-gigachat': {
    requestsPerMinute: 100,
    requestsPerSecond: 5,
    safetyMargin: 0.8,
  } satisfies RateLimitConfig,

  /**
   * Yandex GPT API
   */
  'yandex-gpt': {
    requestsPerMinute: 100,
    requestsPerSecond: 10,
    safetyMargin: 0.8,
  } satisfies RateLimitConfig,

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL MODELS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Local Ollama
   * No external rate limits, only GPU concurrency
   */
  'ollama-local': {
    maxConcurrentRequests: 4,
  } satisfies RateLimitConfig,

  /**
   * Self-hosted vLLM
   */
  'vllm-local': {
    maxConcurrentRequests: 8,
    requestsPerSecond: 100,
  } satisfies RateLimitConfig,

  /**
   * Self-hosted text-embeddings-inference
   */
  'tei-local': {
    maxConcurrentRequests: 16,
  } satisfies RateLimitConfig,

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * No rate limiting (for testing or unlimited APIs)
   */
  unlimited: {} satisfies RateLimitConfig,

  /**
   * Very conservative (for debugging rate limit issues)
   */
  debug: {
    tokensPerMinute: 10_000,
    requestsPerMinute: 10,
    maxConcurrentRequests: 1,
    safetyMargin: 0.5,
  } satisfies RateLimitConfig,
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

/**
 * Get rate limit config from preset name or custom config.
 *
 * @param configOrPreset - Config object or preset name
 * @returns Resolved rate limit configuration
 *
 * @example
 * ```typescript
 * // Use preset
 * const config = getRateLimitConfig('openai-tier-2');
 *
 * // Use custom config
 * const config = getRateLimitConfig({ tokensPerMinute: 100000 });
 *
 * // Default (openai-tier-2)
 * const config = getRateLimitConfig();
 * ```
 */
export function getRateLimitConfig(
  configOrPreset?: RateLimitConfig | RateLimitPreset | string
): RateLimitConfig {
  if (!configOrPreset) {
    // Default: OpenAI Tier 2 (most common for paid accounts)
    return RATE_LIMIT_PRESETS['openai-tier-2'];
  }

  if (typeof configOrPreset === 'string') {
    const preset = RATE_LIMIT_PRESETS[configOrPreset as RateLimitPreset];
    if (!preset) {
      throw new Error(`Unknown rate limit preset: ${configOrPreset}`);
    }
    return preset;
  }

  return configOrPreset;
}

/**
 * Estimate tokens for a text (rough approximation).
 * Uses ~4 characters per token as a conservative estimate.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  // GPT tokenizers average ~4 chars per token for English
  // Use 3.5 to be more conservative (slightly overestimate)
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate tokens for multiple texts.
 *
 * @param texts - Array of texts
 * @returns Total estimated token count
 */
export function estimateBatchTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokens(text), 0);
}
