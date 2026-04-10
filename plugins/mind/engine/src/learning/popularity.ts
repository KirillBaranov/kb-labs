/**
 * @module @kb-labs/mind-engine/learning/popularity
 * Popularity boost system for frequently used chunks
 */

import type { FeedbackStore } from './feedback';

export interface PopularityBoost {
  /**
   * Calculate popularity boost for a chunk
   * Returns multiplier (1.0 = no boost, >1.0 = boosted)
   */
  getBoost(chunkId: string, scopeId: string): Promise<number>;
  
  /**
   * Get usage count for a chunk
   */
  getUsageCount(chunkId: string, scopeId: string): Promise<number>;
}

/**
 * Popularity boost calculator
 * Uses logarithmic scaling to prevent over-boosting popular chunks
 */
export class PopularityBoostCalculator implements PopularityBoost {
  private readonly feedbackStore: FeedbackStore;
  private readonly options: {
    maxBoost: number; // Maximum boost multiplier (default: 1.5 = 50% boost)
    decayFactor: number; // How quickly boost decays (default: 0.1)
    minUsageForBoost: number; // Minimum usage count to get boost (default: 3)
  };

  constructor(
    feedbackStore: FeedbackStore,
    options?: {
      maxBoost?: number;
      decayFactor?: number;
      minUsageForBoost?: number;
    },
  ) {
    this.feedbackStore = feedbackStore;
    this.options = {
      maxBoost: options?.maxBoost ?? 1.5,
      decayFactor: options?.decayFactor ?? 0.1,
      minUsageForBoost: options?.minUsageForBoost ?? 3,
    };
  }

  async getBoost(chunkId: string, scopeId: string): Promise<number> {
    const usageCount = await this.getUsageCount(chunkId, scopeId);
    
    if (usageCount < this.options.minUsageForBoost) {
      return 1.0; // No boost for rarely used chunks
    }

    // Logarithmic scaling: log(usageCount + 1) * decayFactor
    // This prevents over-boosting while still rewarding popular chunks
    const logBoost = Math.log(usageCount + 1) * this.options.decayFactor;
    
    // Cap at maxBoost
    return Math.min(this.options.maxBoost, 1.0 + logBoost);
  }

  async getUsageCount(chunkId: string, scopeId: string): Promise<number> {
    return this.feedbackStore.getChunkUsageCount(chunkId, scopeId);
  }
}

