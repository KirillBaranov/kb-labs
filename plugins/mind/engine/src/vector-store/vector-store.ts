/**
 * @module @kb-labs/mind-engine/vector-store/vector-store
 * Vector store interface for abstracting storage backends
 */

import type { EmbeddingVector, SpanRange } from '../types/engine-contracts';

// Re-export for convenience
export type { EmbeddingVector };

export interface StoredMindChunk {
  chunkId: string;
  scopeId: string;
  sourceId: string;
  path: string;
  span: SpanRange;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: EmbeddingVector;
}

export interface VectorSearchFilters {
  sourceIds?: Set<string>;
  pathMatcher?: (filePath: string) => boolean;
}

export interface VectorSearchMatch {
  chunk: StoredMindChunk;
  score: number;
}

/**
 * Vector store interface for abstracting storage backends
 */
export interface FileMetadata {
  path: string;
  mtime: number; // File modification time
  hash?: string; // Optional content hash for more reliable change detection
}

export interface VectorStore {
  /**
   * Replace all chunks for a scope (full rebuild)
   */
  replaceScope(scopeId: string, chunks: StoredMindChunk[]): Promise<void>;

  /**
   * Update scope incrementally (only changed files)
   * If fileMetadata is provided, only files that changed will be re-indexed
   */
  updateScope?(
    scopeId: string,
    chunks: StoredMindChunk[],
    fileMetadata?: Map<string, FileMetadata>,
  ): Promise<void>;

  /**
   * Upsert chunks to a scope without reading existing data
   * This is memory-efficient for streaming/incremental indexing
   */
  upsertChunks?(scopeId: string, chunks: StoredMindChunk[]): Promise<void>;

  /**
   * Search for similar chunks using vector similarity
   */
  search(
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]>;

  /**
   * Delete a scope
   */
  deleteScope?(scopeId: string): Promise<void>;

  /**
   * Check if a scope exists
   */
  scopeExists?(scopeId: string): Promise<boolean>;

  /**
   * Get all chunks for a scope (for keyword search)
   * Returns empty array if scope doesn't exist
   */
  getAllChunks?(scopeId: string, filters?: VectorSearchFilters): Promise<StoredMindChunk[]>;

  /**
   * Create a scoped adapter for StorageStage.
   * StorageStage expects batch methods without scopeId parameter.
   * This method returns an adapter object with scopeId pre-bound.
   */
  createScopedAdapter?(scopeId: string): {
    insertBatch(chunks: any[]): Promise<number>;
    updateBatch(chunks: any[]): Promise<number>;
    checkExistence(chunkIds: string[]): Promise<Set<string>>;
    getChunksByHash(hashes: string[]): Promise<Map<string, string[]>>;
    getChunkIdsByPaths(paths: string[]): Promise<Map<string, string[]>>;
    deleteBatch(chunkIds: string[]): Promise<number>;
  };

  /**
   * Get file metadata for incremental indexing (filtering stage)
   * Returns metadata for files that exist in the vector store
   * @param scopeId Scope ID
   * @param paths File paths to check
   * @returns Map of path -> metadata (mtime, size, hash)
   */
  getFilesMetadata?(
    scopeId: string,
    paths: string[]
  ): Promise<Map<string, { mtime: number; size: number; hash: string }>>;
}
