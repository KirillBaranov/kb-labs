/**
 * @module @kb-labs/mind-engine/search/hybrid
 * Hybrid search orchestrator combining vector and keyword search with RRF
 */

import type {
  EmbeddingVector,
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
} from '../vector-store/vector-store';
import type { KeywordSearchOptions } from './keyword';

export interface HybridSearchOptions {
  /**
   * Weight for vector search results (0-1)
   * Default: 0.7 (70% vector, 30% keyword)
   */
  vectorWeight?: number;

  /**
   * Weight for keyword search results (0-1)
   * Default: 0.3 (30% keyword, 70% vector)
   */
  keywordWeight?: number;

  /**
   * RRF (Reciprocal Rank Fusion) constant
   * Default: 60 (common value in literature)
   */
  rrfK?: number;

  /**
   * Maximum results to fetch from each search method
   * Default: limit * 2 (to ensure enough candidates for fusion)
   */
  candidateLimit?: number;

  /**
   * BM25 keyword search options
   */
  keywordOptions?: KeywordSearchOptions;
}

const DEFAULT_OPTIONS: Required<Pick<HybridSearchOptions, 'vectorWeight' | 'keywordWeight' | 'rrfK'>> = {
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  rrfK: 60,
};

/**
 * Reciprocal Rank Fusion (RRF) score calculation
 */
function calculateRRFScore(rank: number, k: number): number {
  return 1 / (k + rank);
}

/**
 * Hybrid search combining vector and keyword search with RRF
 */
export async function hybridSearch(
  vectorSearch: (
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ) => Promise<VectorSearchMatch[]>,
  keywordSearchFn: (
    chunks: StoredMindChunk[],
    query: string,
    limit: number,
    filters?: VectorSearchFilters,
    options?: KeywordSearchOptions,
  ) => VectorSearchMatch[],
  scopeId: string,
  queryVector: EmbeddingVector,
  queryText: string,
  allChunks: StoredMindChunk[],
  limit: number,
  filters?: VectorSearchFilters,
  options: HybridSearchOptions = {},
): Promise<VectorSearchMatch[]> {
  const opts = {
    ...DEFAULT_OPTIONS,
    candidateLimit: options.candidateLimit ?? limit * 2,
    keywordOptions: options.keywordOptions,
  };

  // Normalize weights
  const totalWeight = opts.vectorWeight + opts.keywordWeight;
  const normalizedVectorWeight = opts.vectorWeight / totalWeight;
  const normalizedKeywordWeight = opts.keywordWeight / totalWeight;

  // Run both searches in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(scopeId, queryVector, opts.candidateLimit, filters),
    Promise.resolve(
      keywordSearchFn(allChunks, queryText, opts.candidateLimit, filters, opts.keywordOptions),
    ),
  ]);

  // Build chunk ID to match maps for quick lookup
  const vectorMap = new Map<string, VectorSearchMatch>();
  const keywordMap = new Map<string, VectorSearchMatch>();

  for (const match of vectorResults) {
    vectorMap.set(match.chunk.chunkId, match);
  }

  for (const match of keywordResults) {
    keywordMap.set(match.chunk.chunkId, match);
  }

  // Collect all unique chunk IDs
  const allChunkIds = new Set([
    ...vectorMap.keys(),
    ...keywordMap.keys(),
  ]);

  // Calculate RRF scores for each chunk
  const scores = new Map<string, number>();

  // Process vector search results
  vectorResults.forEach((match, rank) => {
    const rrfScore = calculateRRFScore(rank + 1, opts.rrfK);
    const weightedScore = rrfScore * normalizedVectorWeight;
    scores.set(match.chunk.chunkId, (scores.get(match.chunk.chunkId) ?? 0) + weightedScore);
  });

  // Process keyword search results
  keywordResults.forEach((match, rank) => {
    const rrfScore = calculateRRFScore(rank + 1, opts.rrfK);
    const weightedScore = rrfScore * normalizedKeywordWeight;
    scores.set(match.chunk.chunkId, (scores.get(match.chunk.chunkId) ?? 0) + weightedScore);
  });

  // Combine results: prefer matches that appear in both searches
  const combinedMatches: Array<{
    match: VectorSearchMatch;
    score: number;
    inBoth: boolean;
  }> = [];

  for (const chunkId of allChunkIds) {
    const vectorMatch = vectorMap.get(chunkId);
    const keywordMatch = keywordMap.get(chunkId);
    const rrfScore = scores.get(chunkId) ?? 0;

    // Prefer matches that appear in both searches
    const inBoth = vectorMatch !== undefined && keywordMatch !== undefined;

    // Use the match from vector search if available (has embedding), otherwise keyword
    const match = vectorMatch ?? keywordMatch!;

    // Boost score if match appears in both searches
    const finalScore = inBoth ? rrfScore * 1.2 : rrfScore;

    combinedMatches.push({
      match,
      score: finalScore,
      inBoth,
    });
  }

  // Sort by final score and return top results
  return combinedMatches
    .sort((a, b) => {
      // First sort by whether in both searches
      if (a.inBoth !== b.inBoth) {
        return b.inBoth ? 1 : -1;
      }
      // Then by score
      return b.score - a.score;
    })
    .slice(0, limit)
    .map(item => ({
      chunk: item.match.chunk,
      score: item.score,
    }));
}

