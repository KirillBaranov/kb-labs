/**
 * @module @kb-labs/mind-engine/vector-store/platform-adapter
 * Adapter that bridges platform IVectorStore to Mind's VectorStore interface.
 *
 * This is a pure adapter with NO Mind business logic.
 * All Mind-specific logic (scopeId, chunk metadata, storage) stays in MindEngine.
 */

import type { IVectorStore, IStorage } from '@kb-labs/sdk';
import type {
  VectorStore,
  StoredMindChunk,
  VectorSearchMatch,
  VectorSearchFilters,
} from './vector-store';
import type { EmbeddingVector } from './vector-store';
import { withRetry } from './retry';
import type { RetryOptions } from './retry';

interface PlatformAdapterOptions {
  vectorStore: IVectorStore;
  storage?: IStorage;
  /** Retry configuration for transient search failures. Defaults to 4 attempts, 100 ms base delay. */
  retry?: RetryOptions;
}

/**
 * Pure adapter: converts Mind's VectorStore interface calls to platform IVectorStore calls.
 * NO business logic here - just type conversion and delegation.
 */
export class PlatformVectorStoreAdapter implements VectorStore {
  private readonly vectorStore: IVectorStore;
  private readonly storage?: IStorage;
  private readonly retryOptions: RetryOptions;

  constructor(options: PlatformAdapterOptions) {
    this.vectorStore = options.vectorStore;
    this.storage = options.storage;
    this.retryOptions = options.retry ?? {};
  }

  /**
   * Replace all chunks for a scope.
   * Converts Mind chunks to platform VectorRecords.
   */
  async replaceScope(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    // Delete existing chunks with this scopeId (if query() is available)
    if (this.vectorStore.query) {
      const existing = await this.vectorStore.query({
        field: 'scopeId',
        operator: 'eq',
        value: scopeId,
      });
      if (existing.length > 0) {
        await this.vectorStore.delete(existing.map(v => v.id));
      }
    }

    // Upsert new chunks
    if (chunks.length > 0) {
      const records = chunks.map(chunk => ({
        id: this.makeRecordId(scopeId, chunk.chunkId),
        vector: chunk.embedding.values,
        metadata: this.buildMetadata(scopeId, chunk),
      }));
      await this.vectorStore.upsert(records);
    }

    // Save to storage if available (for getAllChunks fallback)
    if (this.storage) {
      const manifestPath = `mind/vector-index/${scopeId}.json`;
      const payload = JSON.stringify(chunks, null, 2);
      await this.storage.write(manifestPath, Buffer.from(payload));
    }
  }

  /**
   * Upsert chunks without reading existing data (memory-efficient).
   */
  async upsertChunks(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    if (chunks.length === 0) {return;}

    const records = chunks.map(chunk => ({
      id: this.makeRecordId(scopeId, chunk.chunkId),
      vector: chunk.embedding.values,
      metadata: this.buildMetadata(scopeId, chunk),
    }));

    await this.vectorStore.upsert(records);
  }

  /**
   * Search for similar chunks using vector similarity.
   * Automatically retries on transient errors (network blips, HTTP 429/502/503/504).
   */
  async search(
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]> {
    return withRetry(async () => {
      // Search with scopeId filter
      const results = await this.vectorStore.search(
        vector.values,
        limit * 3, // Over-fetch to apply filters
        { field: 'scopeId', operator: 'eq', value: scopeId },
      );

      // Convert VectorSearchResult[] to VectorSearchMatch[]
      const matches: VectorSearchMatch[] = [];
      for (const result of results) {
        const chunk = this.vectorRecordToChunk(scopeId, result.id, result.metadata, vector.values);
        if (!chunk) {continue;}

        // Apply filters
        if (filters) {
          if (filters.sourceIds?.size && !filters.sourceIds.has(chunk.sourceId)) {continue;}
          if (filters.pathMatcher && !filters.pathMatcher(chunk.path)) {continue;}
        }

        matches.push({ chunk, score: result.score });
        if (matches.length >= limit) {break;}
      }

      return matches;
    }, this.retryOptions);
  }

  /**
   * Get all chunks for a scope (for keyword search).
   * Uses platform's query() if available, otherwise falls back to storage.
   */
  async getAllChunks(scopeId: string, filters?: VectorSearchFilters): Promise<StoredMindChunk[]> {
    // Try query() first (fast, no timeout)
    if (this.vectorStore.query) {
      try {
        const vectors = await this.vectorStore.query({
          field: 'scopeId',
          operator: 'eq',
          value: scopeId,
        });

        const chunks = vectors
          .map(v => this.vectorRecordToChunk(scopeId, v.id, v.metadata, v.vector))
          .filter((c): c is StoredMindChunk => c !== null);

        // Apply filters
        if (!filters) {return chunks;}
        return chunks.filter(chunk => {
          if (filters.sourceIds?.size && !filters.sourceIds.has(chunk.sourceId)) {return false;}
          if (filters.pathMatcher && !filters.pathMatcher(chunk.path)) {return false;}
          return true;
        });
      } catch (error) {
        // Silently fall back to storage on query failure
      }
    }

    // Fallback: load from storage (may timeout on large scopes)
    if (this.storage) {
      const manifestPath = `mind/vector-index/${scopeId}.json`;
      const data = await this.storage.read(manifestPath);
      if (data) {
        const chunks = JSON.parse(data.toString('utf8')) as StoredMindChunk[];
        if (!filters) {return chunks;}
        return chunks.filter(chunk => {
          if (filters.sourceIds?.size && !filters.sourceIds.has(chunk.sourceId)) {return false;}
          if (filters.pathMatcher && !filters.pathMatcher(chunk.path)) {return false;}
          return true;
        });
      }
    }

    return [];
  }

  /**
   * Check if a scope exists.
   */
  async scopeExists(scopeId: string): Promise<boolean> {
    if (!this.storage) {return false;}
    const manifestPath = `mind/vector-index/${scopeId}.json`;
    return this.storage.exists(manifestPath);
  }

  /**
   * Delete a scope.
   */
  async deleteScope(scopeId: string): Promise<void> {
    // Delete from vector store
    if (this.vectorStore.query) {
      const existing = await this.vectorStore.query({
        field: 'scopeId',
        operator: 'eq',
        value: scopeId,
      });
      if (existing.length > 0) {
        await this.vectorStore.delete(existing.map(v => v.id));
      }
    }

    // Delete from storage
    if (this.storage) {
      const manifestPath = `mind/vector-index/${scopeId}.json`;
      await this.storage.write(manifestPath, Buffer.from('[]'));
    }
  }

  // ===== Batch Operations for StorageStage =====

  /**
   * Create a scoped adapter for StorageStage.
   * StorageStage expects methods without scopeId parameter.
   */
  createScopedAdapter(scopeId: string) {
    return {
      insertBatch: async (chunks: any[]) => this.insertBatch(scopeId, chunks),
      updateBatch: async (chunks: any[]) => this.updateBatch(scopeId, chunks),
      checkExistence: async (chunkIds: string[]) => this.checkExistence(scopeId, chunkIds),
      getChunksByHash: async (hashes: string[]) => this.getChunksByHash(scopeId, hashes),
      getChunkIdsByPaths: async (paths: string[]) => this.getChunkIdsByPaths(scopeId, paths),
      deleteBatch: async (chunkIds: string[]) => this.deleteBatch(scopeId, chunkIds),
    };
  }

  /**
   * Insert multiple chunks in one batch operation.
   * Used by StorageStage for efficient bulk indexing.
   */
  private async insertBatch(scopeId: string, chunks: any[]): Promise<number> {
    if (chunks.length === 0) {return 0;}

    const records = chunks.map(chunk => ({
      id: this.makeRecordId(scopeId, chunk.chunkId),
      vector: Array.isArray(chunk.embedding) ? chunk.embedding : chunk.embedding.values,
      metadata: {
        scopeId,
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        path: chunk.path,
        span: chunk.span,
        text: chunk.text, // Store text in metadata for retrieval
        fileHash: chunk.hash,
        fileMtime: chunk.mtime,
        ...chunk.metadata,
      },
    }));

    await this.vectorStore.upsert(records);
    return chunks.length;
  }

  /**
   * Update existing chunks in batch.
   * Currently delegates to insertBatch (upsert handles both insert and update).
   */
  private async updateBatch(scopeId: string, chunks: any[]): Promise<number> {
    return this.insertBatch(scopeId, chunks);
  }

  /**
   * Check which chunks already exist in the vector store.
   * Uses batch query with 'in' operator for efficiency (single IPC call).
   */
  private async checkExistence(scopeId: string, chunkIds: string[]): Promise<Set<string>> {
    if (chunkIds.length === 0) {return new Set();}
    if (!this.vectorStore.query) {return new Set();}

    try {
      // Query by chunkId field in metadata (not by point ID!)
      // Qdrant query searches payload fields, not point IDs
      const results = await this.vectorStore.query({
        field: 'chunkId',
        operator: 'in',
        value: chunkIds,
      });

      // Extract chunk IDs from results
      const existingSet = new Set<string>();
      for (const result of results) {
        const chunkId = result.metadata?.chunkId as string;
        if (chunkId) {
          existingSet.add(chunkId);
        }
      }

      return existingSet;
    } catch (error) {
      // Return empty set on failure
      return new Set();
    }
  }

  /**
   * Get chunks by file hash for deduplication.
   * Uses batch query with 'in' operator for efficiency (single IPC call).
   */
  private async getChunksByHash(scopeId: string, hashes: string[]): Promise<Map<string, string[]>> {
    if (hashes.length === 0) {return new Map();}
    if (!this.vectorStore.query) {return new Map();}

    try {
      // Batch query by fileHash (single IPC call!)
      const results = await this.vectorStore.query({
        field: 'fileHash',
        operator: 'in',
        value: hashes,
      });

      // Group chunkIds by hash
      const map = new Map<string, string[]>();
      for (const result of results) {
        const hash = result.metadata?.fileHash as string;
        const chunkId = result.metadata?.chunkId as string;
        if (hash && chunkId) {
          const ids = map.get(hash) ?? [];
          ids.push(chunkId);
          map.set(hash, ids);
        }
      }

      return map;
    } catch (error) {
      return new Map();
    }
  }

  /**
   * Get chunk IDs by file paths.
   * Used for incremental indexing to find stale chunks.
   */
  private async getChunkIdsByPaths(scopeId: string, paths: string[]): Promise<Map<string, string[]>> {
    if (paths.length === 0) {return new Map();}
    if (!this.vectorStore.query) {return new Map();}

    try {
      // Batch query by path field
      const results = await this.vectorStore.query({
        field: 'path',
        operator: 'in',
        value: paths,
      });

      // Group chunkIds by path
      const map = new Map<string, string[]>();
      for (const result of results) {
        const path = result.metadata?.path as string;
        const chunkId = result.metadata?.chunkId as string;
        if (path && chunkId) {
          const ids = map.get(path) ?? [];
          ids.push(chunkId);
          map.set(path, ids);
        }
      }

      return map;
    } catch (error) {
      return new Map();
    }
  }

  /**
   * Delete chunks by their IDs.
   */
  private async deleteBatch(scopeId: string, chunkIds: string[]): Promise<number> {
    if (chunkIds.length === 0) {return 0;}

    try {
      const recordIds = chunkIds.map(id => this.makeRecordId(scopeId, id));
      await this.vectorStore.delete(recordIds);
      return chunkIds.length;
    } catch (error) {
      // Return 0 on failure
      return 0;
    }
  }

  /**
   * Get file metadata for incremental indexing (filtering stage).
   * Returns metadata for files that exist in the vector store.
   * Uses batch query to get all chunks for matching paths efficiently.
   */
  async getFilesMetadata(
    scopeId: string,
    paths: string[]
  ): Promise<Map<string, { mtime: number; size: number; hash: string }>> {
    if (paths.length === 0) {return new Map();}
    if (!this.vectorStore.query) {return new Map();}

    try {
      // Batch query by path field (single IPC call!)
      const results = await this.vectorStore.query({
        field: 'path',
        operator: 'in',
        value: paths,
      });

      // Group by path and extract most recent metadata
      // (each file may have multiple chunks, we just need one)
      const fileMetadata = new Map<string, { mtime: number; size: number; hash: string }>();

      for (const result of results) {
        const path = result.metadata?.path as string;
        const fileHash = result.metadata?.fileHash as string;
        const fileMtime = result.metadata?.fileMtime as number;

        if (path && fileHash !== undefined && fileMtime !== undefined) {
          // Only store if not already stored (first chunk wins)
          if (!fileMetadata.has(path)) {
            fileMetadata.set(path, {
              hash: fileHash,
              mtime: fileMtime,
              size: 0, // Size not stored in chunks currently (only hash/mtime matter)
            });
          }
        }
      }

      return fileMetadata;
    } catch (error) {
      // Return empty map on failure
      return new Map();
    }
  }

  // ===== Private helpers (type conversion only, no business logic) =====

  private makeRecordId(scopeId: string, chunkId: string): string {
    return `${scopeId}:${chunkId}`;
  }

  private buildMetadata(scopeId: string, chunk: StoredMindChunk): Record<string, unknown> {
    return {
      scopeId,
      chunkId: chunk.chunkId,
      sourceId: chunk.sourceId,
      path: chunk.path,
      span: chunk.span,
      metadata: chunk.metadata,
    };
  }

  private vectorRecordToChunk(
    scopeId: string,
    id: string,
    metadata: Record<string, unknown> | undefined,
    vector: number[],
  ): StoredMindChunk | null {
    if (!metadata) {return null;}

    return {
      chunkId: (metadata.chunkId as string) ?? '',
      scopeId: (metadata.scopeId as string) ?? scopeId,
      sourceId: (metadata.sourceId as string) ?? '',
      path: (metadata.path as string) ?? '',
      span: (metadata.span as any) ?? { startLine: 0, endLine: 0 },
      text: (metadata.text as string) ?? '', // Text now stored in metadata
      metadata: metadata.metadata as Record<string, unknown> | undefined,
      embedding: { values: vector, dim: vector.length },
    };
  }
}
