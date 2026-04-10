/**
 * @module @kb-labs/mind-engine/deduplication/semantic-deduplicator
 * Semantic deduplication for search results
 *
 * Removes near-duplicate results based on embedding similarity
 * while preserving diversity and relevance.
 */

import { cosineSimilarity } from '@kb-labs/mind-core';
import type { VectorSearchMatch } from '../vector-store/vector-store';

export interface DeduplicationOptions {
  /**
   * Similarity threshold (0-1)
   * Results with similarity above this are considered duplicates
   * Default: 0.95
   */
  threshold?: number;

  /**
   * Deduplication strategy
   * - 'greedy': Keep first occurrence, remove subsequent duplicates (fast)
   * - 'max-score': Keep highest scoring duplicate (better quality)
   * - 'diverse': Balance between score and diversity (best for variety)
   * Default: 'max-score'
   */
  strategy?: 'greedy' | 'max-score' | 'diverse';

  /**
   * Preserve top N results regardless of similarity
   * Ensures we don't remove highly relevant results
   * Default: 3
   */
  preserveTopN?: number;

  /**
   * Enable cross-file deduplication
   * If false, only deduplicate within same file
   * Default: true
   */
  crossFile?: boolean;

  /**
   * Minimum different files to keep
   * Ensures diversity across files
   * Default: 3
   */
  minDifferentFiles?: number;
}

export interface DeduplicationResult {
  /** Deduplicated matches */
  matches: VectorSearchMatch[];

  /** Number of duplicates removed */
  duplicatesRemoved: number;

  /** Duplicate groups for debugging */
  duplicateGroups?: Array<{
    kept: VectorSearchMatch;
    removed: VectorSearchMatch[];
    similarity: number;
  }>;
}

/**
 * Semantic deduplicator for search results
 */
export class SemanticDeduplicator {
  private readonly options: Required<DeduplicationOptions>;

  constructor(options: DeduplicationOptions = {}) {
    this.options = {
      threshold: options.threshold ?? 0.95,
      strategy: options.strategy ?? 'max-score',
      preserveTopN: options.preserveTopN ?? 3,
      crossFile: options.crossFile ?? true,
      minDifferentFiles: options.minDifferentFiles ?? 3,
    };
  }

  /**
   * Deduplicate search results
   */
  deduplicate(
    matches: VectorSearchMatch[],
    includeDebugInfo = false,
  ): DeduplicationResult {
    if (matches.length === 0) {
      return { matches: [], duplicatesRemoved: 0 };
    }

    // Sort by score (highest first)
    const sorted = [...matches].sort((a, b) => b.score - a.score);

    // Always preserve top N
    const preserved = sorted.slice(0, this.options.preserveTopN);
    const toProcess = sorted.slice(this.options.preserveTopN);

    // Deduplicate based on strategy
    let deduplicated: VectorSearchMatch[];
    let duplicateGroups: Array<{
      kept: VectorSearchMatch;
      removed: VectorSearchMatch[];
      similarity: number;
    }> = [];

    switch (this.options.strategy) {
      case 'greedy':
        ({ deduplicated, duplicateGroups } = this.greedyDeduplicate(
          preserved,
          toProcess,
          includeDebugInfo,
        ));
        break;

      case 'max-score':
        ({ deduplicated, duplicateGroups } = this.maxScoreDeduplicate(
          preserved,
          toProcess,
          includeDebugInfo,
        ));
        break;

      case 'diverse':
        ({ deduplicated, duplicateGroups } = this.diverseDeduplicate(
          preserved,
          toProcess,
          includeDebugInfo,
        ));
        break;
    }

    // Ensure minimum file diversity
    deduplicated = this.ensureFileDiversity(deduplicated, matches);

    const duplicatesRemoved = matches.length - deduplicated.length;

    return {
      matches: deduplicated,
      duplicatesRemoved,
      duplicateGroups: includeDebugInfo ? duplicateGroups : undefined,
    };
  }

  /**
   * Greedy deduplication: keep first, remove subsequent
   */
  private greedyDeduplicate(
    preserved: VectorSearchMatch[],
    candidates: VectorSearchMatch[],
    includeDebugInfo: boolean,
  ): {
    deduplicated: VectorSearchMatch[];
    duplicateGroups: Array<{ kept: VectorSearchMatch; removed: VectorSearchMatch[]; similarity: number }>;
  } {
    const kept: VectorSearchMatch[] = [...preserved];
    const duplicateGroups: Array<{
      kept: VectorSearchMatch;
      removed: VectorSearchMatch[];
      similarity: number;
    }> = [];

    for (const candidate of candidates) {
      let isDuplicate = false;
      let maxSimilarity = 0;
      let duplicateOf: VectorSearchMatch | null = null;

      for (const existing of kept) {
        // Skip cross-file comparison if disabled
        if (!this.options.crossFile && candidate.chunk.path !== existing.chunk.path) {
          continue;
        }

        const similarity = this.calculateSimilarity(candidate, existing);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          duplicateOf = existing;
        }

        if (similarity >= this.options.threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        kept.push(candidate);
      } else if (includeDebugInfo && duplicateOf) {
        // Find or create duplicate group
        let group = duplicateGroups.find(g => g.kept === duplicateOf);
        if (!group) {
          group = { kept: duplicateOf, removed: [], similarity: maxSimilarity };
          duplicateGroups.push(group);
        }
        group.removed.push(candidate);
      }
    }

    return { deduplicated: kept, duplicateGroups };
  }

  /**
   * Max-score deduplication: keep highest scoring in each group
   */
  private maxScoreDeduplicate(
    preserved: VectorSearchMatch[],
    candidates: VectorSearchMatch[],
    includeDebugInfo: boolean,
  ): {
    deduplicated: VectorSearchMatch[];
    duplicateGroups: Array<{ kept: VectorSearchMatch; removed: VectorSearchMatch[]; similarity: number }>;
  } {
    // Build similarity groups
    const groups: VectorSearchMatch[][] = [];
    const allMatches = [...preserved, ...candidates];

    for (const match of allMatches) {
      let foundGroup = false;

      for (const group of groups) {
        const representative = group[0]!;

        // Skip cross-file comparison if disabled
        if (!this.options.crossFile && match.chunk.path !== representative.chunk.path) {
          continue;
        }

        const similarity = this.calculateSimilarity(match, representative);
        if (similarity >= this.options.threshold) {
          group.push(match);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push([match]);
      }
    }

    // Keep highest score from each group
    const deduplicated = groups.map(group => {
      return group.reduce((best, current) =>
        current.score > best.score ? current : best
      );
    });

    // Build debug info
    const duplicateGroups: Array<{
      kept: VectorSearchMatch;
      removed: VectorSearchMatch[];
      similarity: number;
    }> = [];

    if (includeDebugInfo) {
      for (const group of groups) {
        if (group.length > 1) {
          const kept = group.reduce((best, current) =>
            current.score > best.score ? current : best
          );
          const removed = group.filter(m => m !== kept);
          const avgSimilarity = removed.reduce((sum, m) => {
            return sum + this.calculateSimilarity(m, kept);
          }, 0) / removed.length;

          duplicateGroups.push({ kept, removed, similarity: avgSimilarity });
        }
      }
    }

    return { deduplicated, duplicateGroups };
  }

  /**
   * Diverse deduplication: balance score and diversity
   */
  private diverseDeduplicate(
    preserved: VectorSearchMatch[],
    candidates: VectorSearchMatch[],
    includeDebugInfo: boolean,
  ): {
    deduplicated: VectorSearchMatch[];
    duplicateGroups: Array<{ kept: VectorSearchMatch; removed: VectorSearchMatch[]; similarity: number }>;
  } {
    const kept: VectorSearchMatch[] = [...preserved];
    const duplicateGroups: Array<{
      kept: VectorSearchMatch;
      removed: VectorSearchMatch[];
      similarity: number;
    }> = [];

    // Track file diversity
    const filesIncluded = new Set(preserved.map(m => m.chunk.path));

    for (const candidate of candidates) {
      let maxSimilarity = 0;
      let mostSimilar: VectorSearchMatch | null = null;

      for (const existing of kept) {
        // Skip cross-file comparison if disabled
        if (!this.options.crossFile && candidate.chunk.path !== existing.chunk.path) {
          continue;
        }

        const similarity = this.calculateSimilarity(candidate, existing);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilar = existing;
        }
      }

      // Diversity boost: lower threshold for new files
      const isNewFile = !filesIncluded.has(candidate.chunk.path);
      const effectiveThreshold = isNewFile
        ? this.options.threshold * 0.9 // 10% more lenient for new files
        : this.options.threshold;

      if (maxSimilarity < effectiveThreshold) {
        kept.push(candidate);
        filesIncluded.add(candidate.chunk.path);
      } else if (includeDebugInfo && mostSimilar) {
        let group = duplicateGroups.find(g => g.kept === mostSimilar);
        if (!group) {
          group = { kept: mostSimilar, removed: [], similarity: maxSimilarity };
          duplicateGroups.push(group);
        }
        group.removed.push(candidate);
      }
    }

    return { deduplicated: kept, duplicateGroups };
  }

  /**
   * Ensure minimum file diversity
   */
  private ensureFileDiversity(
    deduplicated: VectorSearchMatch[],
    original: VectorSearchMatch[],
  ): VectorSearchMatch[] {
    const filesIncluded = new Set(deduplicated.map(m => m.chunk.path));

    if (filesIncluded.size >= this.options.minDifferentFiles) {
      return deduplicated;
    }

    // Need more file diversity - add top matches from missing files
    const result = [...deduplicated];
    const filesNeeded = this.options.minDifferentFiles - filesIncluded.size;

    for (const match of original) {
      if (filesIncluded.has(match.chunk.path)) {continue;}
      if (result.some(m => m.chunk.chunkId === match.chunk.chunkId)) {continue;}

      result.push(match);
      filesIncluded.add(match.chunk.path);

      if (filesIncluded.size >= this.options.minDifferentFiles) {
        break;
      }
    }

    // Re-sort by score
    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate similarity between two matches
   * Uses both embedding similarity and text overlap
   */
  private calculateSimilarity(
    match1: VectorSearchMatch,
    match2: VectorSearchMatch,
  ): number {
    // Same chunk = 100% similar
    if (match1.chunk.chunkId === match2.chunk.chunkId) {
      return 1.0;
    }

    // Embedding cosine similarity
    const embeddingSimilarity = cosineSimilarity(
      match1.chunk.embedding.values,
      match2.chunk.embedding.values,
    );

    // Text overlap similarity (Jaccard)
    const textSimilarity = this.jaccardSimilarity(
      match1.chunk.text,
      match2.chunk.text,
    );

    // Weighted combination: 70% embedding, 30% text
    return embeddingSimilarity * 0.7 + textSimilarity * 0.3;
  }


  /**
   * Jaccard similarity between two texts
   */
  private jaccardSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(this.tokenize(text1));
    const tokens2 = new Set(this.tokenize(text2));

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    if (union.size === 0) {return 0;}
    return intersection.size / union.size;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 2); // Filter out very short tokens
  }
}
