/**
 * @module @kb-labs/core-platform/wrappers/analytics-embeddings
 * Analytics wrapper for IEmbeddings that tracks usage
 */

import type { IEmbeddings } from '../adapters/embeddings.js';
import type { IAnalytics } from '../adapters/analytics.js';

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `emb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Estimate cost for embeddings based on text length and provider
 * OpenAI text-embedding-3-small: $0.00002 per 1K tokens (~750 chars)
 */
function estimateCost(textLength: number, provider = 'openai'): number {
  const pricing: Record<string, number> = {
    openai: 0.00002, // per 1K tokens
    cohere: 0.0001, // per 1K tokens
  };

  const pricePerK = pricing[provider] || pricing.openai!;
  const estimatedTokens = Math.ceil(textLength / 750); // rough estimate: 1 token ≈ 0.75 chars
  return (estimatedTokens / 1000) * pricePerK;
}

/**
 * Analytics wrapper for embeddings adapter.
 * Tracks all embedding operations to analytics.
 */
export class AnalyticsEmbeddings implements IEmbeddings {
  constructor(
    private realEmbeddings: IEmbeddings,
    private analytics: IAnalytics
  ) {}

  get dimensions(): number {
    return this.realEmbeddings.dimensions;
  }

  async getDimensions(): Promise<number> {
    return this.realEmbeddings.getDimensions();
  }

  async embed(text: string): Promise<number[]> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Track start
    await this.analytics.track('embeddings.embed.started', {
      requestId,
      textLength: text.length,
      batchSize: 1,
    });

    try {
      const result = await this.realEmbeddings.embed(text);
      const durationMs = Date.now() - startTime;

      // Track completion
      await this.analytics.track('embeddings.embed.completed', {
        requestId,
        textLength: text.length,
        dimensions: result.length,
        durationMs,
        estimatedCost: estimateCost(text.length),
        batchSize: 1,
      });

      return result;
    } catch (error) {
      await this.analytics.track('embeddings.embed.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    const totalTextLength = texts.reduce((sum, text) => sum + text.length, 0);

    // Track start
    await this.analytics.track('embeddings.embedBatch.started', {
      requestId,
      totalTextLength,
      batchSize: texts.length,
    });

    try {
      const results = await this.realEmbeddings.embedBatch(texts);
      const durationMs = Date.now() - startTime;

      // Track completion
      await this.analytics.track('embeddings.embedBatch.completed', {
        requestId,
        totalTextLength,
        batchSize: texts.length,
        dimensions: results[0]?.length ?? 0,
        durationMs,
        estimatedCost: estimateCost(totalTextLength),
        avgTextLength: Math.round(totalTextLength / texts.length),
      });

      return results;
    } catch (error) {
      await this.analytics.track('embeddings.embedBatch.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        batchSize: texts.length,
      });
      throw error;
    }
  }
}
