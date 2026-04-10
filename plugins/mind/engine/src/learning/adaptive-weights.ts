/**
 * @module @kb-labs/mind-engine/learning/adaptive-weights
 * Adaptive weight adjustment for hybrid search
 */

import type { QueryHistoryStore } from './query-history';
import type { FeedbackStore } from './feedback';

export interface AdaptiveWeights {
  /**
   * Get optimal weights for a query
   */
  getWeights(
    queryText: string,
    queryVector: number[],
    scopeId: string,
  ): Promise<{
    vectorWeight: number;
    keywordWeight: number;
    rrfK: number;
  }>;
  
  /**
   * Learn from query results and feedback
   */
  learn(
    queryText: string,
    queryVector: number[],
    scopeId: string,
    vectorResults: Array<{ chunkId: string; score: number }>,
    keywordResults: Array<{ chunkId: string; score: number }>,
    feedback?: Array<{ chunkId: string; score: number }>, // User/agent feedback scores
  ): Promise<void>;
}

/**
 * Adaptive weight calculator
 * Learns optimal weights based on query success
 */
export class AdaptiveWeightCalculator implements AdaptiveWeights {
  private readonly queryHistory: QueryHistoryStore;
  private readonly feedbackStore: FeedbackStore;
  private readonly options: {
    baseVectorWeight: number;
    baseKeywordWeight: number;
    baseRrfK: number;
    adjustmentRange: number; // How much weights can vary (default: 0.2 = ±20%)
    minWeight: number; // Minimum weight (default: 0.1)
    maxWeight: number; // Maximum weight (default: 0.9)
  };

  constructor(
    queryHistory: QueryHistoryStore,
    feedbackStore: FeedbackStore,
    options?: {
      baseVectorWeight?: number;
      baseKeywordWeight?: number;
      baseRrfK?: number;
      adjustmentRange?: number;
      minWeight?: number;
      maxWeight?: number;
    },
  ) {
    this.queryHistory = queryHistory;
    this.feedbackStore = feedbackStore;
    this.options = {
      baseVectorWeight: options?.baseVectorWeight ?? 0.7,
      baseKeywordWeight: options?.baseKeywordWeight ?? 0.3,
      baseRrfK: options?.baseRrfK ?? 60,
      adjustmentRange: options?.adjustmentRange ?? 0.2,
      minWeight: options?.minWeight ?? 0.1,
      maxWeight: options?.maxWeight ?? 0.9,
    };
  }

  async getWeights(
    queryText: string,
    queryVector: number[],
    scopeId: string,
  ): Promise<{
    vectorWeight: number;
    keywordWeight: number;
    rrfK: number;
  }> {
    // Check if we have similar queries with successful patterns
    const similarQueries = await this.queryHistory.findBySimilarQuery(
      queryVector,
      scopeId,
      10,
    );

    if (similarQueries.length === 0) {
      // No history, use base weights
      return {
        vectorWeight: this.options.baseVectorWeight,
        keywordWeight: this.options.baseKeywordWeight,
        rrfK: this.options.baseRrfK,
      };
    }

    // Analyze which search method worked better for similar queries
    let vectorSuccess = 0;
    let keywordSuccess = 0;
    let totalQueries = 0;

    for (const entry of similarQueries) {
      // Get feedback for chunks from this query
      const topChunkIds = entry.topChunkIds.slice(0, 5); // Top 5 chunks
      
      let hasPositiveFeedback = false;
      for (const chunkId of topChunkIds) {
        const avgScore = await this.feedbackStore.getAverageScore(chunkId, scopeId);
        if (avgScore > 0.6) {
          hasPositiveFeedback = true;
          break;
        }
      }

      if (hasPositiveFeedback) {
        // Determine which search method likely contributed more
        // This is simplified - in practice, we'd track which method each chunk came from
        // For now, assume if query has exact keyword matches, keyword search helped
        const hasExactMatches = this.hasExactKeywordMatches(queryText, entry.queryText);
        if (hasExactMatches) {
          keywordSuccess++;
        } else {
          vectorSuccess++;
        }
        totalQueries++;
      }
    }

    if (totalQueries === 0) {
      return {
        vectorWeight: this.options.baseVectorWeight,
        keywordWeight: this.options.baseKeywordWeight,
        rrfK: this.options.baseRrfK,
      };
    }

    // Adjust weights based on success rates
    const vectorSuccessRate = vectorSuccess / totalQueries;
    const keywordSuccessRate = keywordSuccess / totalQueries;

    // Calculate adjustments (bounded by adjustmentRange)
    const vectorAdjustment = (vectorSuccessRate - 0.5) * this.options.adjustmentRange;
    const keywordAdjustment = (keywordSuccessRate - 0.5) * this.options.adjustmentRange;

    let vectorWeight = this.options.baseVectorWeight + vectorAdjustment;
    let keywordWeight = this.options.baseKeywordWeight + keywordAdjustment;

    // Normalize weights
    const total = vectorWeight + keywordWeight;
    vectorWeight = Math.max(
      this.options.minWeight,
      Math.min(this.options.maxWeight, vectorWeight / total),
    );
    keywordWeight = Math.max(
      this.options.minWeight,
      Math.min(this.options.maxWeight, keywordWeight / total),
    );

    // Normalize again to ensure they sum to 1
    const normalizedTotal = vectorWeight + keywordWeight;
    vectorWeight /= normalizedTotal;
    keywordWeight /= normalizedTotal;

    return {
      vectorWeight,
      keywordWeight,
      rrfK: this.options.baseRrfK, // Keep RRF constant for now
    };
  }

  async learn(
    queryText: string,
    queryVector: number[],
    scopeId: string,
    vectorResults: Array<{ chunkId: string; score: number }>,
    keywordResults: Array<{ chunkId: string; score: number }>,
    feedback?: Array<{ chunkId: string; score: number }>,
  ): Promise<void> {
    // Store query history (this will be used for future weight calculations)
    // The actual learning happens in getWeights() when analyzing similar queries
    // This method is a placeholder for future explicit learning mechanisms
  }

  private hasExactKeywordMatches(query1: string, query2: string): boolean {
    const words1 = new Set(query1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(query2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    return intersection.size >= 2; // At least 2 common words
  }
}

