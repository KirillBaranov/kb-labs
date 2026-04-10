/**
 * @module @kb-labs/core-platform/wrappers/analytics-llm
 * AnalyticsLLM - ILLM wrapper that tracks usage to analytics.
 */

import type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMMessage,
  LLMToolCallOptions,
  LLMToolCallResponse,
  LLMProtocolCapabilities,
} from '../adapters/llm.js';
import type { IAnalytics } from '../adapters/analytics.js';

/**
 * ILLM wrapper that tracks all LLM calls to analytics.
 *
 * Features:
 * - Tracks every LLM completion with token usage
 * - Records model, prompt/completion tokens, timestamps
 * - Transparent (implements ILLM interface)
 * - Automatically calculates cost estimates
 *
 * Tracked metrics:
 * - llm.completion.started
 * - llm.completion.completed (with usage, duration, model)
 * - llm.completion.error (with error details)
 *
 * @example
 * ```typescript
 * const trackedLLM = new AnalyticsLLM(realLLM, analytics);
 *
 * // Automatically tracked
 * const response = await trackedLLM.complete('Hello');
 * // → Tracks: model, tokens, duration
 * ```
 */
export class AnalyticsLLM implements ILLM {
  constructor(
    private realLLM: ILLM,
    private analytics: IAnalytics
  ) {}

  async getProtocolCapabilities(): Promise<LLMProtocolCapabilities> {
    if (!this.realLLM.getProtocolCapabilities) {
      return {
        cache: { supported: false },
        stream: { supported: true },
      };
    }
    return this.realLLM.getProtocolCapabilities();
  }

  /**
   * Generate a completion with analytics tracking.
   */
  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Extract routing metadata (set by LLMRouter)
    const metadata = options?.metadata;

    // Track start
    await this.analytics.track('llm.completion.started', {
      requestId,
      tier: metadata?.tier,
      provider: metadata?.provider,
      model: options?.model,
      cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
      cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
      streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
      streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
      streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
      promptLength: prompt.length,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });

    try {
      // Execute real LLM call
      const response = await this.realLLM.complete(prompt, options);
      await this.trackCacheOutcome(requestId, metadata, response);

      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Track completion
      const usageMetrics = buildUsageAnalytics(response);
      await this.analytics.track('llm.completion.completed', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        model: response.model,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        ...usageMetrics,
        durationMs,
      });

      return response;
    } catch (error) {
      // Track error
      await this.analytics.track('llm.completion.error', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Stream a completion.
   * Note: Streaming is harder to track token-by-token, so we track start/end only.
   */
  async *stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Extract routing metadata (set by LLMRouter)
    const metadata = options?.metadata;

    await this.analytics.track('llm.stream.started', {
      requestId,
      tier: metadata?.tier,
      provider: metadata?.provider,
      model: options?.model,
      cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
      cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
      streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
      streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
      streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
      promptLength: prompt.length,
    });

    try {
      let totalChunks = 0;
      let totalLength = 0;

      for await (const chunk of this.realLLM.stream(prompt, options)) {
        totalChunks++;
        totalLength += chunk.length;
        yield chunk;
      }

      await this.analytics.track('llm.stream.completed', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        model: options?.model,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        durationMs: Date.now() - startTime,
        totalChunks,
        totalLength,
      });
    } catch (error) {
      await this.analytics.track('llm.stream.error', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Chat with native tool calling support (optional).
   * Proxies to underlying LLM if it supports chatWithTools.
   */
  async chatWithTools(
    messages: LLMMessage[],
    options: LLMToolCallOptions
  ): Promise<LLMToolCallResponse> {
    // Check if underlying LLM supports chatWithTools
    if (!this.realLLM.chatWithTools) {
      throw new Error('Underlying LLM does not support chatWithTools');
    }

    const startTime = Date.now();
    const requestId = generateRequestId();

    // Extract routing metadata (set by LLMRouter)
    const metadata = options?.metadata;

    // Track start
    await this.analytics.track('llm.chatWithTools.started', {
      requestId,
      tier: metadata?.tier,
      provider: metadata?.provider,
      model: options?.model,
      cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
      cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
      streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
      streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
      streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
      messageCount: messages.length,
      toolCount: options.tools.length,
      toolChoice: options.toolChoice,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });

    try {
      // Execute real LLM call with tools
      const response = await this.realLLM.chatWithTools(messages, options);
      await this.trackCacheOutcome(requestId, metadata, response);

      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Track completion
      const usageMetrics = buildUsageAnalytics(response);
      await this.analytics.track('llm.chatWithTools.completed', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        model: response.model,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        ...usageMetrics,
        toolCallCount: response.toolCalls?.length ?? 0,
        toolNames: response.toolCalls?.map((tc) => tc.name) ?? [],
        durationMs,
      });

      return response;
    } catch (error) {
      // Track error
      await this.analytics.track('llm.chatWithTools.error', {
        requestId,
        tier: metadata?.tier,
        provider: metadata?.provider,
        cacheRequestedMode: metadata?.cacheDecisionTrace?.cacheRequestedMode,
        cacheAppliedMode: metadata?.cacheDecisionTrace?.cacheAppliedMode,
        streamRequestedMode: metadata?.cacheDecisionTrace?.streamRequestedMode,
        streamAppliedMode: metadata?.cacheDecisionTrace?.streamAppliedMode,
        streamFallback: metadata?.cacheDecisionTrace?.streamFallback,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  private async trackCacheOutcome(
    requestId: string,
    metadata: LLMOptions['metadata'],
    response: LLMResponse
  ): Promise<void> {
    const trace = metadata?.cacheDecisionTrace;
    if (!trace) {
      return;
    }

    const cacheReadTokens = response.usage.cacheReadTokens ?? 0;
    const cacheWriteTokens = response.usage.cacheWriteTokens ?? 0;
    const basePayload = {
      requestId,
      tier: metadata?.tier,
      provider: metadata?.provider,
      cacheRequestedMode: trace.cacheRequestedMode,
      cacheAppliedMode: trace.cacheAppliedMode,
      cacheSupported: trace.cacheSupported,
      cacheReadTokens,
      cacheWriteTokens,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      model: response.model,
    };

    if (trace.cacheAppliedMode === 'bypass' || trace.cacheRequestedMode === 'bypass') {
      await this.analytics.track('llm.cache.bypass', {
        ...basePayload,
        reason: trace.reason ?? 'CACHE_BYPASSED',
      });
      return;
    }

    if (cacheReadTokens > 0) {
      await this.analytics.track('llm.cache.hit', basePayload);
      return;
    }

    await this.analytics.track('llm.cache.miss', {
      ...basePayload,
      reason: trace.reason ?? 'NO_CACHE_READ_TOKENS',
    });
  }
}

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `llm-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Estimate cost based on model and token usage.
 * Prices as of 2025-01 (USD per 1M tokens).
 *
 * Note: OpenAI API returns versioned snapshot names (e.g., 'gpt-4o-mini-2024-07-18')
 * even when using aliases (e.g., 'gpt-4o-mini'). We match by prefix using longest-first
 * sorting to ensure specific models match before generic ones.
 *
 * See ADR-0041 for details: docs/adr/0041-llm-cost-calculation-fix.md
 */
function buildUsageAnalytics(response: LLMResponse): Record<string, number> {
  const model = response.model.toLowerCase();
  const promptTokens = response.usage.promptTokens;
  const completionTokens = response.usage.completionTokens;
  const cacheReadTokens = response.usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = response.usage.cacheWriteTokens ?? 0;
  const billablePromptTokens =
    response.usage.billablePromptTokens ?? Math.max(promptTokens - cacheReadTokens, 0);
  const totalTokens = promptTokens + completionTokens;
  const billableTotalTokens = billablePromptTokens + completionTokens;

  const pricing = getPricing(model);

  const normalInputTokens = Math.max(promptTokens - cacheReadTokens, 0);
  const cachedInputTokens = cacheReadTokens;
  const cachedInputRate = pricing.cachedInput ?? pricing.input;

  const inputCost =
    (normalInputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * cachedInputRate;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const estimatedCost = inputCost + outputCost;

  const uncachedInputCost = (promptTokens / 1_000_000) * pricing.input;
  const uncachedOutputCost = outputCost;
  const estimatedUncachedCost = uncachedInputCost + uncachedOutputCost;
  const estimatedCacheSavingsUsd = Math.max(estimatedUncachedCost - estimatedCost, 0);
  const estimatedSavedPromptTokens = Math.max(promptTokens - billablePromptTokens, 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    billablePromptTokens,
    billableTotalTokens,
    estimatedSavedPromptTokens,
    estimatedCost,
    estimatedUncachedCost,
    estimatedCacheSavingsUsd,
  };
}

function getPricing(model: string): { input: number; output: number; cachedInput?: number } {
  // Pricing map (input / output per 1M tokens)
  // Source: vendor public pricing pages (approx; keep updated when changing model lineup)
  const pricing: Record<string, { input: number; output: number; cachedInput?: number }> = {
    // OpenAI models (2025-01 pricing)
    'gpt-4o-mini': { input: 0.15, output: 0.60, cachedInput: 0.075 },
    'gpt-4o': { input: 2.50, output: 10.00, cachedInput: 1.25 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

    // Claude models (2025-01 pricing)
    // Cached input discounts vary by policy (5m/1h), conservative defaults:
    // if unknown, keep cachedInput equal to input.
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
  };

  // Sort keys by length (longest first) to match specific models before generic ones
  // Example: 'gpt-4o-mini' should match before 'gpt-4o'
  // This handles versioned names: 'gpt-4o-mini-2024-07-18' → 'gpt-4o-mini' ✅
  const sortedKeys = Object.keys(pricing).sort((a, b) => b.length - a.length);

  // Find matching pricing
  let modelPricing = pricing['gpt-4o-mini']!; // Default to cheapest OpenAI model
  for (const key of sortedKeys) {
    if (model.includes(key)) {
      modelPricing = pricing[key]!;
      break;
    }
  }

  return modelPricing;
}
