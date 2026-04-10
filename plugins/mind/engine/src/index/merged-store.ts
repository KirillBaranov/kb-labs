/**
 * @module @kb-labs/mind-engine/index/merged-store
 * Merged vector store that combines base index with local overlay
 */

import type {
  EmbeddingVector,
  VectorStore,
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
  FileMetadata,
} from '../vector-store/vector-store';

/**
 * Options for merged vector store
 */
export interface MergedVectorStoreOptions {
  /** Base index (read-only, from central storage) */
  base: VectorStore;

  /** Local overlay (changes since base) */
  overlay: VectorStore;

  /** Paths deleted since base index was created */
  deletedPaths: Set<string>;

  /** Modified paths (overlay takes precedence) */
  modifiedPaths?: Set<string>;
}

/**
 * Merged vector store that combines base index with local overlay.
 *
 * Search logic:
 * 1. Search both base and overlay
 * 2. Filter out deleted paths from base results
 * 3. For modified paths, overlay results override base
 * 4. Merge and re-rank by score
 */
export class MergedVectorStore implements VectorStore {
  private readonly base: VectorStore;
  private readonly overlay: VectorStore;
  private readonly deletedPaths: Set<string>;
  private readonly modifiedPaths: Set<string>;

  constructor(options: MergedVectorStoreOptions) {
    this.base = options.base;
    this.overlay = options.overlay;
    this.deletedPaths = options.deletedPaths;
    this.modifiedPaths = options.modifiedPaths ?? new Set();
  }

  /**
   * Search across base and overlay, merging results
   */
  async search(
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]> {
    // Search both stores in parallel
    // Over-fetch from base to account for filtering
    const [baseResults, overlayResults] = await Promise.all([
      this.base.search(scopeId, vector, limit * 2, filters),
      this.overlay.search(scopeId, vector, limit, filters),
    ]);

    // Collect overlay paths for deduplication
    const overlayPaths = new Set(overlayResults.map(r => r.chunk.path));

    // Filter base results:
    // 1. Remove deleted paths
    // 2. Remove paths that have overlay versions (modified files)
    const filteredBase = baseResults.filter(result => {
      const path = result.chunk.path;

      // Skip if file was deleted
      if (this.deletedPaths.has(path)) {
        return false;
      }

      // Skip if overlay has a version (overlay takes precedence)
      if (overlayPaths.has(path) || this.modifiedPaths.has(path)) {
        return false;
      }

      return true;
    });

    // Merge results: overlay first, then filtered base
    const merged = [...overlayResults, ...filteredBase];

    // Sort by score descending
    merged.sort((a, b) => b.score - a.score);

    // Return top K
    return merged.slice(0, limit);
  }

  /**
   * Get all chunks from merged index
   */
  async getAllChunks(
    scopeId: string,
    filters?: VectorSearchFilters,
  ): Promise<StoredMindChunk[]> {
    // Get chunks from both stores
    const [baseChunks, overlayChunks] = await Promise.all([
      this.base.getAllChunks?.(scopeId, filters) ?? [],
      this.overlay.getAllChunks?.(scopeId, filters) ?? [],
    ]);

    // Collect overlay paths
    const overlayPaths = new Set(overlayChunks.map(c => c.path));

    // Filter base chunks
    const filteredBase = baseChunks.filter(chunk => {
      const path = chunk.path;

      if (this.deletedPaths.has(path)) {
        return false;
      }

      if (overlayPaths.has(path) || this.modifiedPaths.has(path)) {
        return false;
      }

      return true;
    });

    // Merge: overlay chunks + filtered base
    return [...overlayChunks, ...filteredBase];
  }

  /**
   * Replace scope - delegates to overlay only (base is read-only)
   */
  async replaceScope(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    // For merged store, replaceScope only affects overlay
    await this.overlay.replaceScope(scopeId, chunks);
  }

  /**
   * Update scope - delegates to overlay
   */
  async updateScope(
    scopeId: string,
    chunks: StoredMindChunk[],
    fileMetadata?: Map<string, FileMetadata>,
  ): Promise<void> {
    if (this.overlay.updateScope) {
      await this.overlay.updateScope(scopeId, chunks, fileMetadata);
    } else {
      await this.overlay.replaceScope(scopeId, chunks);
    }
  }

  /**
   * Upsert chunks - delegates to overlay
   */
  async upsertChunks(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    if (this.overlay.upsertChunks) {
      await this.overlay.upsertChunks(scopeId, chunks);
    } else {
      // Fallback: get existing overlay chunks and merge
      const existing = await this.overlay.getAllChunks?.(scopeId) ?? [];
      const existingMap = new Map(existing.map(c => [c.chunkId, c]));

      for (const chunk of chunks) {
        existingMap.set(chunk.chunkId, chunk);
      }

      await this.overlay.replaceScope(scopeId, Array.from(existingMap.values()));
    }
  }

  /**
   * Delete scope - clears overlay only (base is read-only)
   */
  async deleteScope(scopeId: string): Promise<void> {
    if (this.overlay.deleteScope) {
      await this.overlay.deleteScope(scopeId);
    }
  }

  /**
   * Check if scope exists (in either base or overlay)
   */
  async scopeExists(scopeId: string): Promise<boolean> {
    const [baseExists, overlayExists] = await Promise.all([
      this.base.scopeExists?.(scopeId) ?? false,
      this.overlay.scopeExists?.(scopeId) ?? false,
    ]);

    return baseExists || overlayExists;
  }

  /**
   * Get statistics about the merged index
   */
  async getStats(scopeId: string): Promise<MergedIndexStats> {
    const [baseChunks, overlayChunks] = await Promise.all([
      this.base.getAllChunks?.(scopeId) ?? [],
      this.overlay.getAllChunks?.(scopeId) ?? [],
    ]);

    const overlayPaths = new Set(overlayChunks.map(c => c.path));

    // Count how many base chunks are actually used
    let usedBaseChunks = 0;
    let filteredBaseChunks = 0;

    for (const chunk of baseChunks) {
      if (this.deletedPaths.has(chunk.path) || overlayPaths.has(chunk.path)) {
        filteredBaseChunks++;
      } else {
        usedBaseChunks++;
      }
    }

    return {
      baseTotal: baseChunks.length,
      baseUsed: usedBaseChunks,
      baseFiltered: filteredBaseChunks,
      overlayChunks: overlayChunks.length,
      deletedPaths: this.deletedPaths.size,
      modifiedPaths: this.modifiedPaths.size,
      effectiveTotal: usedBaseChunks + overlayChunks.length,
    };
  }
}

/**
 * Statistics about merged index
 */
export interface MergedIndexStats {
  /** Total chunks in base index */
  baseTotal: number;

  /** Base chunks actually used (not filtered) */
  baseUsed: number;

  /** Base chunks filtered out */
  baseFiltered: number;

  /** Chunks in overlay */
  overlayChunks: number;

  /** Number of deleted paths */
  deletedPaths: number;

  /** Number of modified paths */
  modifiedPaths: number;

  /** Effective total chunks */
  effectiveTotal: number;
}

/**
 * Create a merged vector store
 */
export function createMergedVectorStore(
  options: MergedVectorStoreOptions,
): MergedVectorStore {
  return new MergedVectorStore(options);
}
