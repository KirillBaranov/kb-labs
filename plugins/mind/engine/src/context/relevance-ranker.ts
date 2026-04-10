/**
 * RelevanceRanker - Advanced relevance scoring for search results
 *
 * Combines multiple signals to produce better relevance scores:
 * - Vector similarity (cosine distance)
 * - Keyword matching (BM25-like)
 * - Recency (newer code ranks higher)
 * - Popularity (frequently accessed code)
 * - Code structure (function definitions rank higher than calls)
 *
 * Benefits:
 * - More accurate search results
 * - Context-aware ranking
 * - Personalization support
 */

import type { KnowledgeChunk } from '../types/engine-contracts';

export interface RankingSignal {
  /**
   * Vector similarity score (0-1)
   */
  vectorScore: number;

  /**
   * Keyword match score (0-1)
   */
  keywordScore: number;

  /**
   * Recency score (0-1, 1 = very recent)
   */
  recencyScore: number;

  /**
   * Popularity score (0-1, 1 = very popular)
   */
  popularityScore: number;

  /**
   * Structure score (0-1, 1 = high importance)
   */
  structureScore: number;
}

export interface RankedChunk extends KnowledgeChunk {
  /**
   * Final relevance score (0-1)
   */
  relevanceScore: number;

  /**
   * Individual signal scores
   */
  signals: RankingSignal;

  /**
   * Rank position (1-based)
   */
  rank: number;
}

export interface RelevanceRankerOptions {
  /**
   * Weight for vector similarity (default: 0.5)
   */
  vectorWeight?: number;

  /**
   * Weight for keyword matching (default: 0.2)
   */
  keywordWeight?: number;

  /**
   * Weight for recency (default: 0.1)
   */
  recencyWeight?: number;

  /**
   * Weight for popularity (default: 0.1)
   */
  popularityWeight?: number;

  /**
   * Weight for code structure (default: 0.1)
   */
  structureWeight?: number;

  /**
   * Enable personalization
   * Default: false
   */
  personalize?: boolean;
}

/**
 * Relevance Ranker
 * Advanced multi-signal ranking
 */
export class RelevanceRanker {
  private weights: Required<Omit<RelevanceRankerOptions, 'personalize'>>;

  constructor(private options: RelevanceRankerOptions = {}) {
    // Normalize weights
    this.weights = {
      vectorWeight: options.vectorWeight ?? 0.5,
      keywordWeight: options.keywordWeight ?? 0.2,
      recencyWeight: options.recencyWeight ?? 0.1,
      popularityWeight: options.popularityWeight ?? 0.1,
      structureWeight: options.structureWeight ?? 0.1,
    };

    // Ensure weights sum to 1.0
    const sum =
      this.weights.vectorWeight +
      this.weights.keywordWeight +
      this.weights.recencyWeight +
      this.weights.popularityWeight +
      this.weights.structureWeight;

    if (Math.abs(sum - 1.0) > 0.01) {
      // Normalize
      this.weights.vectorWeight /= sum;
      this.weights.keywordWeight /= sum;
      this.weights.recencyWeight /= sum;
      this.weights.popularityWeight /= sum;
      this.weights.structureWeight /= sum;
    }
  }

  /**
   * Rank chunks by relevance
   */
  async rank(
    chunks: KnowledgeChunk[],
    query: string
  ): Promise<RankedChunk[]> {
    // Calculate signals for each chunk
    const withSignals = await Promise.all(
      chunks.map(chunk => this.calculateSignals(chunk, query))
    );

    // Calculate final scores
    const scored = withSignals.map(item => ({
      ...item.chunk,
      relevanceScore: this.calculateFinalScore(item.signals),
      signals: item.signals,
      rank: 0, // Will be set after sorting
    }));

    // Sort by score (descending)
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Assign ranks
    scored.forEach((item, index) => {
      item.rank = index + 1;
    });

    return scored;
  }

  /**
   * Calculate all signals for a chunk
   */
  private async calculateSignals(
    chunk: KnowledgeChunk,
    query: string
  ): Promise<{ chunk: KnowledgeChunk; signals: RankingSignal }> {
    const signals: RankingSignal = {
      vectorScore: this.calculateVectorScore(chunk),
      keywordScore: this.calculateKeywordScore(chunk, query),
      recencyScore: this.calculateRecencyScore(chunk),
      popularityScore: this.calculatePopularityScore(chunk),
      structureScore: this.calculateStructureScore(chunk),
    };

    return { chunk, signals };
  }

  /**
   * Calculate final relevance score from signals
   */
  private calculateFinalScore(signals: RankingSignal): number {
    return (
      signals.vectorScore * this.weights.vectorWeight +
      signals.keywordScore * this.weights.keywordWeight +
      signals.recencyScore * this.weights.recencyWeight +
      signals.popularityScore * this.weights.popularityWeight +
      signals.structureScore * this.weights.structureWeight
    );
  }

  /**
   * Calculate vector similarity score
   */
  private calculateVectorScore(chunk: KnowledgeChunk): number {
    // Assume score from vector search is already normalized (0-1)
    return chunk.score ?? 0.5;
  }

  /**
   * Calculate keyword match score (BM25-like)
   */
  private calculateKeywordScore(
    chunk: KnowledgeChunk,
    query: string
  ): number {
    const queryTokens = this.tokenize(query);
    const chunkTokens = this.tokenize(chunk.text);

    // Count keyword matches
    let matches = 0;
    for (const token of queryTokens) {
      if (chunkTokens.includes(token)) {
        matches++;
      }
    }

    // Normalize by query length
    return queryTokens.length > 0 ? matches / queryTokens.length : 0;
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(chunk: KnowledgeChunk): number {
    const mtime = chunk.metadata?.fileMtime as number | undefined;
    if (!mtime) {
      return 0.5; // Unknown recency
    }

    // Calculate age in days
    const now = Date.now();
    const ageMs = now - mtime;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Exponential decay: score = e^(-age/30)
    // 30 days = half-life
    const score = Math.exp(-ageDays / 30);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate popularity score
   */
  private calculatePopularityScore(chunk: KnowledgeChunk): number {
    // TODO: Track chunk access frequency
    // For now, use a heuristic based on chunk type
    const chunkType = chunk.metadata?.type as string | undefined;

    if (chunkType === 'function' || chunkType === 'class') {
      return 0.8; // Definitions are important
    } else if (chunkType === 'method') {
      return 0.6;
    } else {
      return 0.4;
    }
  }

  /**
   * Calculate code structure score
   */
  private calculateStructureScore(chunk: KnowledgeChunk): number {
    const chunkType = chunk.metadata?.type as string | undefined;
    const chunkName = chunk.metadata?.name as string | undefined;

    let score = 0.5; // Baseline

    // Function/class definitions rank higher
    if (chunkType === 'function' || chunkType === 'class') {
      score += 0.3;
    } else if (chunkType === 'method') {
      score += 0.2;
    }

    // Exported code ranks higher
    const isExported = chunk.text.includes('export');
    if (isExported) {
      score += 0.1;
    }

    // Named code ranks higher than anonymous
    if (chunkName && chunkName !== 'anonymous') {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Tokenize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 0);
  }

  /**
   * Update weights dynamically
   */
  updateWeights(weights: Partial<RelevanceRankerOptions>): void {
    Object.assign(this.weights, weights);

    // Re-normalize
    const sum =
      this.weights.vectorWeight +
      this.weights.keywordWeight +
      this.weights.recencyWeight +
      this.weights.popularityWeight +
      this.weights.structureWeight;

    if (Math.abs(sum - 1.0) > 0.01) {
      this.weights.vectorWeight /= sum;
      this.weights.keywordWeight /= sum;
      this.weights.recencyWeight /= sum;
      this.weights.popularityWeight /= sum;
      this.weights.structureWeight /= sum;
    }
  }

  /**
   * Get current weights
   */
  getWeights(): Required<Omit<RelevanceRankerOptions, 'personalize'>> {
    return { ...this.weights };
  }
}

/**
 * Create relevance ranker with default options
 */
export function createRelevanceRanker(
  options: RelevanceRankerOptions = {}
): RelevanceRanker {
  return new RelevanceRanker(options);
}
