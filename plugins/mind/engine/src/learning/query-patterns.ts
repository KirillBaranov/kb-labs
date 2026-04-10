/**
 * @module @kb-labs/mind-engine/learning/query-patterns
 * Query pattern learning and matching
 */

import type { QueryHistoryStore } from './query-history';
import type { VectorSearchMatch } from '../vector-store/vector-store';

/**
 * Query pattern matcher using query history
 */
export class QueryPatternMatcher {
  private readonly queryHistory: QueryHistoryStore;
  private readonly options: {
    similarityThreshold: number; // Minimum similarity to consider (default: 0.7)
    minPatternOccurrences: number; // Minimum times a pattern must appear (default: 2)
  };

  constructor(
    queryHistory: QueryHistoryStore,
    options?: {
      similarityThreshold?: number;
      minPatternOccurrences?: number;
    },
  ) {
    this.queryHistory = queryHistory;
    this.options = {
      similarityThreshold: options?.similarityThreshold ?? 0.7,
      minPatternOccurrences: options?.minPatternOccurrences ?? 2,
    };
  }

  async findSimilarQueries(
    queryText: string,
    queryVector: number[],
    scopeId: string,
  ): Promise<Array<{ query: string; chunkIds: string[]; similarity: number }>> {
    // Find similar queries by vector similarity
    const similarEntries = await this.queryHistory.findBySimilarQuery(
      queryVector,
      scopeId,
      20, // Get top 20 similar queries
    );

    // Also check exact query matches
    const exactMatches = await this.queryHistory.findByQuery(queryText, scopeId);
    const allEntries = [...similarEntries, ...exactMatches];

    // Group by query text and aggregate chunk IDs
    const queryMap = new Map<string, {
      query: string;
      chunkIds: Set<string>;
      similarities: number[];
    }>();

    for (const entry of allEntries) {
      const existing = queryMap.get(entry.queryText);
      if (existing) {
        // Merge chunk IDs
        for (const chunkId of entry.topChunkIds) {
          existing.chunkIds.add(chunkId);
        }
        existing.similarities.push(0.9); // Assume high similarity for exact matches
      } else {
        // Calculate similarity (simplified - in real implementation, use actual vector similarity)
        const similarity = this.calculateTextSimilarity(queryText, entry.queryText);
        if (similarity >= this.options.similarityThreshold) {
          queryMap.set(entry.queryText, {
            query: entry.queryText,
            chunkIds: new Set(entry.topChunkIds),
            similarities: [similarity],
          });
        }
      }
    }

    // Convert to array and calculate average similarity
    return Array.from(queryMap.values())
      .map(item => ({
        query: item.query,
        chunkIds: Array.from(item.chunkIds),
        similarity: item.similarities.reduce((a, b) => a + b, 0) / item.similarities.length,
      }))
      .filter(item => item.chunkIds.length > 0)
      .sort((a, b) => b.similarity - a.similarity);
  }

  async getRecommendedChunks(
    queryText: string,
    queryVector: number[],
    scopeId: string,
    limit: number = 10,
  ): Promise<string[]> {
    const similarQueries = await this.findSimilarQueries(queryText, queryVector, scopeId);
    
    // Count chunk occurrences across similar queries
    const chunkScores = new Map<string, number>();
    
    for (const pattern of similarQueries) {
      for (const chunkId of pattern.chunkIds) {
        const currentScore = chunkScores.get(chunkId) ?? 0;
        // Weight by similarity: more similar queries contribute more
        chunkScores.set(chunkId, currentScore + pattern.similarity);
      }
    }

    // Sort by score and return top chunks
    return Array.from(chunkScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([chunkId]) => chunkId);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * Boost search results based on query patterns
 */
export function applyPatternBoost(
  matches: VectorSearchMatch[],
  recommendedChunkIds: string[],
  boostMultiplier: number = 1.3,
): VectorSearchMatch[] {
  const recommendedSet = new Set(recommendedChunkIds);
  
  return matches.map(match => {
    if (recommendedSet.has(match.chunk.chunkId)) {
      return {
        ...match,
        score: match.score * boostMultiplier,
      };
    }
    return match;
  });
}

