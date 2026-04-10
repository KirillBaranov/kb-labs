/**
 * @module @kb-labs/mind-engine/optimization/context-optimizer
 * Context optimization: deduplication, diversification, adaptive selection
 */

import type { KnowledgeChunk } from '../types/engine-contracts';
import type { VectorSearchMatch } from '../vector-store/vector-store';

export interface ContextOptimizationOptions {
  /**
   * Maximum number of chunks to return
   */
  maxChunks: number;

  /**
   * Enable deduplication
   * Default: true
   */
  deduplication?: boolean;

  /**
   * Similarity threshold for deduplication (0-1)
   * Chunks with similarity above this threshold are considered duplicates
   * Default: 0.9
   */
  deduplicationThreshold?: number;

  /**
   * Enable diversification
   * Default: true
   */
  diversification?: boolean;

  /**
   * Diversity threshold (0-1)
   * Higher values ensure more diverse results
   * Default: 0.3
   */
  diversityThreshold?: number;

  /**
   * Maximum chunks per file
   * Default: 3
   */
  maxChunksPerFile?: number;

  /**
   * Enable adaptive selection based on token budget
   * Default: false
   */
  adaptiveSelection?: boolean;

  /**
   * Token budget (if adaptive selection is enabled)
   */
  tokenBudget?: number;

  /**
   * Average tokens per chunk (for estimation)
   * Default: 200
   */
  avgTokensPerChunk?: number;
}

const DEFAULT_OPTIONS: Required<Omit<ContextOptimizationOptions, 'maxChunks' | 'tokenBudget'>> = {
  deduplication: true,
  deduplicationThreshold: 0.9,
  diversification: true,
  diversityThreshold: 0.3,
  maxChunksPerFile: 3,
  adaptiveSelection: false,
  avgTokensPerChunk: 200,
};

/**
 * Calculate cosine similarity between two text chunks
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  // Simple word-based similarity (can be improved with embeddings)
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 && words2.size === 0) {
    return 1;
  }
  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Estimate token count for text (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough approximation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Context optimizer for improving search result quality
 */
export class ContextOptimizer {
  /**
   * Optimize context chunks
   */
  optimize(
    matches: VectorSearchMatch[],
    options: ContextOptimizationOptions,
  ): KnowledgeChunk[] {
    const opts = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // Convert matches to chunks
    let chunks: KnowledgeChunk[] = matches.map(match => ({
      id: match.chunk.chunkId,
      sourceId: match.chunk.sourceId,
      path: match.chunk.path,
      span: match.chunk.span,
      text: match.chunk.text,
      score: match.score,
      metadata: match.chunk.metadata,
    }));

    // Step 1: Deduplication
    if (opts.deduplication) {
      chunks = this.deduplicate(chunks, opts.deduplicationThreshold);
    }

    // Step 2: Diversification
    if (opts.diversification) {
      chunks = this.diversify(chunks, opts.diversityThreshold, opts.maxChunksPerFile);
    }

    // Step 3: Adaptive selection (if enabled)
    if (opts.adaptiveSelection && opts.tokenBudget) {
      chunks = this.adaptiveSelect(chunks, opts.tokenBudget, opts.avgTokensPerChunk);
    }

    // Step 4: Select top-K
    chunks = this.selectTopK(chunks, opts.maxChunks);

    return chunks;
  }

  /**
   * Remove duplicate or highly similar chunks
   */
  private deduplicate(
    chunks: KnowledgeChunk[],
    threshold: number,
  ): KnowledgeChunk[] {
    const deduplicated: KnowledgeChunk[] = [];
    const seen = new Set<string>();

    for (const chunk of chunks) {
      // Check for exact duplicates (same path and span)
      const key = `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
      if (seen.has(key)) {
        continue;
      }

      // Check for semantic similarity with already selected chunks
      let isDuplicate = false;
      for (const existing of deduplicated) {
        const similarity = calculateTextSimilarity(chunk.text, existing.text);
        if (similarity >= threshold) {
          // Keep the one with higher score
          if (chunk.score <= existing.score) {
            isDuplicate = true;
            break;
          } else {
            // Replace existing with better scoring chunk
            const index = deduplicated.indexOf(existing);
            deduplicated[index] = chunk;
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate) {
        deduplicated.push(chunk);
        seen.add(key);
      }
    }

    return deduplicated;
  }

  /**
   * Diversify results to ensure variety across files and topics
   */
  private diversify(
    chunks: KnowledgeChunk[],
    threshold: number,
    maxChunksPerFile: number,
  ): KnowledgeChunk[] {
    const diversified: KnowledgeChunk[] = [];
    const fileCounts = new Map<string, number>();
    const fileChunks = new Map<string, KnowledgeChunk[]>();

    // Group chunks by file
    for (const chunk of chunks) {
      if (!fileChunks.has(chunk.path)) {
        fileChunks.set(chunk.path, []);
      }
      fileChunks.get(chunk.path)!.push(chunk);
    }

    // Select chunks ensuring diversity
    const selected = new Set<string>();

    // First pass: select top chunk from each file
    for (const [file, fileChunksList] of fileChunks.entries()) {
      if (fileChunksList.length > 0) {
        const topChunk = fileChunksList[0]!;
        diversified.push(topChunk);
        selected.add(topChunk.id ?? `${topChunk.path}:${topChunk.span.startLine}-${topChunk.span.endLine}`);
        fileCounts.set(file, 1);
      }
    }

    // Second pass: add more chunks from files, ensuring diversity
    for (const chunk of chunks) {
      const chunkId = chunk.id ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
      if (selected.has(chunkId)) {
        continue;
      }

      const fileCount = fileCounts.get(chunk.path) ?? 0;
      if (fileCount >= maxChunksPerFile) {
        continue;
      }

      // Check diversity: ensure chunk is different enough from already selected chunks
      let isDiverse = true;
      for (const existing of diversified) {
        const similarity = calculateTextSimilarity(chunk.text, existing.text);
        if (similarity > threshold) {
          // Too similar, skip unless this one has much higher score
          if (chunk.score <= existing.score * 1.2) {
            isDiverse = false;
            break;
          }
        }
      }

      if (isDiverse) {
        diversified.push(chunk);
        selected.add(chunkId);
        fileCounts.set(chunk.path, fileCount + 1);
      }
    }

    // Sort by score (maintaining diversity)
    diversified.sort((a, b) => b.score - a.score);

    return diversified;
  }

  /**
   * Adaptive selection based on token budget
   */
  private adaptiveSelect(
    chunks: KnowledgeChunk[],
    tokenBudget: number,
    avgTokensPerChunk: number,
  ): KnowledgeChunk[] {
    const selected: KnowledgeChunk[] = [];
    let totalTokens = 0;

    for (const chunk of chunks) {
      const chunkTokens = estimateTokens(chunk.text);
      const estimatedTotal = totalTokens + chunkTokens;

      if (estimatedTotal <= tokenBudget) {
        selected.push(chunk);
        totalTokens = estimatedTotal;
      } else {
        // Check if we can fit a smaller portion
        const remainingBudget = tokenBudget - totalTokens;
        if (remainingBudget > avgTokensPerChunk * 0.5) {
          // Can fit at least half a chunk, add it
          selected.push(chunk);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Select top-K chunks by score
   */
  private selectTopK(chunks: KnowledgeChunk[], k: number): KnowledgeChunk[] {
    return chunks.slice(0, k);
  }
}





