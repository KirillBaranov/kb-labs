/**
 * @module @kb-labs/mind-engine/search/keyword
 * Keyword search implementation using BM25 algorithm
 */

import type {
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
} from '../vector-store/vector-store';

export interface KeywordSearchOptions {
  k1?: number; // Term frequency saturation parameter (default: 1.2)
  b?: number; // Length normalization parameter (default: 0.75)
  minScore?: number; // Minimum score threshold
}

const DEFAULT_OPTIONS: Required<KeywordSearchOptions> = {
  k1: 1.2,
  b: 0.75,
  minScore: 0,
};

/**
 * Tokenize text into terms (simple word-based tokenization)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Build inverted index from chunks
 */
interface InvertedIndex {
  termToChunks: Map<string, Set<number>>; // term -> chunk indices
  chunkToTerms: Map<number, Map<string, number>>; // chunk index -> term -> frequency
  chunkLengths: Map<number, number>; // chunk index -> total terms
  avgChunkLength: number;
}

function buildInvertedIndex(chunks: StoredMindChunk[]): InvertedIndex {
  const termToChunks = new Map<string, Set<number>>();
  const chunkToTerms = new Map<number, Map<string, number>>();
  const chunkLengths = new Map<number, number>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const terms = tokenize(chunk.text);
    const termFreq = new Map<string, number>();

    for (const term of terms) {
      // Update term frequency
      termFreq.set(term, (termFreq.get(term) ?? 0) + 1);

      // Update inverted index
      if (!termToChunks.has(term)) {
        termToChunks.set(term, new Set());
      }
      termToChunks.get(term)!.add(i);
    }

    chunkToTerms.set(i, termFreq);
    chunkLengths.set(i, terms.length);
  }

  // Calculate average chunk length
  const totalLength = Array.from(chunkLengths.values()).reduce((sum, len) => sum + len, 0);
  const avgChunkLength = chunks.length > 0 ? totalLength / chunks.length : 0;

  return {
    termToChunks,
    chunkToTerms,
    chunkLengths,
    avgChunkLength,
  };
}

/**
 * Calculate BM25 score for a chunk
 */
function calculateBM25Score(
  queryTerms: string[],
  chunkIndex: number,
  index: InvertedIndex,
  options: Required<KeywordSearchOptions>,
): number {
  const { k1, b } = options;
  const avgChunkLength = index.avgChunkLength;
  const chunkLength = index.chunkLengths.get(chunkIndex) ?? 0;
  const chunkTerms = index.chunkToTerms.get(chunkIndex) ?? new Map();
  const totalChunks = index.chunkLengths.size;

  let score = 0;

  for (const term of queryTerms) {
    const termFreq = chunkTerms.get(term) ?? 0;
    if (termFreq === 0) {
      continue;
    }

    // Number of chunks containing this term
    const docFreq = index.termToChunks.get(term)?.size ?? 0;
    if (docFreq === 0) {
      continue;
    }

    // IDF (Inverse Document Frequency)
    const idf = Math.log((totalChunks - docFreq + 0.5) / (docFreq + 0.5) + 1);

    // Term frequency normalization
    const normalization = (1 - b) + b * (chunkLength / avgChunkLength);
    const tf = (termFreq * (k1 + 1)) / (termFreq + k1 * normalization);

    score += idf * tf;
  }

  return score;
}

/**
 * Keyword search using BM25 algorithm
 */
export function keywordSearch(
  chunks: StoredMindChunk[],
  query: string,
  limit: number,
  filters?: VectorSearchFilters,
  options: KeywordSearchOptions = {},
): VectorSearchMatch[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter chunks by filters first
  const filteredChunks = chunks.filter(chunk => {
    if (filters?.sourceIds && !filters.sourceIds.has(chunk.sourceId)) {
      return false;
    }
    if (filters?.pathMatcher && !filters.pathMatcher(chunk.path)) {
      return false;
    }
    return true;
  });

  if (filteredChunks.length === 0) {
    return [];
  }

  // Tokenize query
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return [];
  }

  // Build inverted index
  const index = buildInvertedIndex(filteredChunks);

  // Calculate BM25 scores for each chunk
  const scores = filteredChunks.map((chunk, idx) => ({
    chunk,
    score: calculateBM25Score(queryTerms, idx, index, opts),
  }));

  // Filter by minimum score and sort
  return scores
    .filter(match => match.score >= opts.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

