/**
 * @module @kb-labs/mind-engine/vector-store/local
 * Local file-based vector store (wraps MindVectorStore)
 */

import type {
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
  VectorStore,
} from './vector-store';
import {
  MindVectorStore,
} from '@kb-labs/mind-vector-store';
import { withRetry } from './retry';
import type { RetryOptions } from './retry';

/**
 * Raw chunk shape produced by StorageStage before conversion to StoredMindChunk.
 * Embedding may be a flat array or a structured object.
 */
interface RawChunkInput {
  chunkId: string;
  sourceId: string;
  path: string;
  span: { startLine: number; endLine: number };
  text: string;
  hash?: string;
  mtime?: number;
  metadata?: Record<string, unknown>;
  embedding: number[] | { values: number[]; dim: number };
}

export interface LocalVectorStoreOptions {
  indexDir: string;
  /** Retry configuration for transient search failures. Defaults to 4 attempts, 100 ms base delay. */
  retry?: RetryOptions;
}

/**
 * Local file-based vector store implementation
 */
export class LocalVectorStore implements VectorStore {
  private readonly store: MindVectorStore;
  private readonly retryOptions: RetryOptions;

  constructor(options: LocalVectorStoreOptions) {
    this.store = new MindVectorStore({
      indexDir: options.indexDir,
    });
    this.retryOptions = options.retry ?? {};
  }

  async replaceScope(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    await this.store.replaceScope(scopeId, chunks as unknown as Parameters<typeof this.store.replaceScope>[1]);
  }

  async search(
    scopeId: string,
    vector: Parameters<VectorStore['search']>[1],
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]> {
    return withRetry(
      () => this.store.search(
        scopeId,
        vector as unknown as Parameters<typeof this.store.search>[1],
        limit,
        filters as unknown as Parameters<typeof this.store.search>[3],
      ),
      this.retryOptions,
    ) as unknown as Promise<VectorSearchMatch[]>;
  }

  async getAllChunks(scopeId: string, filters?: VectorSearchFilters): Promise<StoredMindChunk[]> {
    // Access internal cache or load from file
    // MindVectorStore has a private cache, so we need to use search with a dummy vector
    // or access the file directly. For now, use search with large limit and dummy vector.
    const dummyVector = {
      dim: 384, // Default dimension
      values: new Array(384).fill(0),
    };
    const matches = await this.search(scopeId, dummyVector, 100000, filters);
    return matches.map(match => match.chunk);
  }

  async upsertChunks(scopeId: string, chunks: StoredMindChunk[]): Promise<void> {
    const existing = await this.getAllChunks(scopeId);
    const byId = new Map(existing.map(chunk => [chunk.chunkId, chunk]));
    for (const chunk of chunks) {
      byId.set(chunk.chunkId, chunk);
    }
    await this.replaceScope(scopeId, Array.from(byId.values()));
  }

  async deleteScope(scopeId: string): Promise<void> {
    await this.replaceScope(scopeId, []);
  }

  async scopeExists(scopeId: string): Promise<boolean> {
    const chunks = await this.getAllChunks(scopeId);
    return chunks.length > 0;
  }

  async getFilesMetadata(
    scopeId: string,
    paths: string[],
  ): Promise<Map<string, { mtime: number; size: number; hash: string }>> {
    if (paths.length === 0) {
      return new Map();
    }

    const pathSet = new Set(paths.map(p => p.replace(/\\/g, '/')));
    const allChunks = await this.getAllChunks(scopeId);
    const metadataMap = new Map<string, { mtime: number; size: number; hash: string }>();

    for (const chunk of allChunks) {
      const normalizedPath = chunk.path.replace(/\\/g, '/');
      if (!pathSet.has(normalizedPath) || metadataMap.has(normalizedPath)) {
        continue;
      }

      const fileHash = (chunk.metadata?.fileHash as string | undefined) ?? '';
      const fileMtime = Number(chunk.metadata?.fileMtime ?? 0);
      metadataMap.set(normalizedPath, {
        mtime: Number.isFinite(fileMtime) ? fileMtime : 0,
        size: 0,
        hash: fileHash,
      });
    }

    return metadataMap;
  }

  createScopedAdapter(scopeId: string) {
    return {
      insertBatch: async (chunks: RawChunkInput[]) => this.insertBatch(scopeId, chunks),
      updateBatch: async (chunks: RawChunkInput[]) => this.updateBatch(scopeId, chunks),
      checkExistence: async (chunkIds: string[]) => this.checkExistence(scopeId, chunkIds),
      getChunksByHash: async (hashes: string[]) => this.getChunksByHash(scopeId, hashes),
      getChunkIdsByPaths: async (paths: string[]) => this.getChunkIdsByPaths(scopeId, paths),
      deleteBatch: async (chunkIds: string[]) => this.deleteBatch(scopeId, chunkIds),
    };
  }

  private async insertBatch(scopeId: string, chunks: RawChunkInput[]): Promise<number> {
    if (chunks.length === 0) {
      return 0;
    }

    const storedChunks: StoredMindChunk[] = chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      scopeId,
      sourceId: chunk.sourceId,
      path: chunk.path,
      span: chunk.span,
      text: chunk.text,
      metadata: { ...chunk.metadata, fileHash: chunk.hash, fileMtime: chunk.mtime },
      embedding: Array.isArray(chunk.embedding)
        ? { values: chunk.embedding, dim: chunk.embedding.length }
        : chunk.embedding,
    }));

    await this.upsertChunks(scopeId, storedChunks);
    return storedChunks.length;
  }

  private async updateBatch(scopeId: string, chunks: RawChunkInput[]): Promise<number> {
    return this.insertBatch(scopeId, chunks);
  }

  private async checkExistence(scopeId: string, chunkIds: string[]): Promise<Set<string>> {
    if (chunkIds.length === 0) {
      return new Set();
    }

    const idSet = new Set(chunkIds);
    const existing = await this.getAllChunks(scopeId);
    const found = new Set<string>();
    for (const chunk of existing) {
      if (idSet.has(chunk.chunkId)) {
        found.add(chunk.chunkId);
      }
    }
    return found;
  }

  private async getChunksByHash(scopeId: string, hashes: string[]): Promise<Map<string, string[]>> {
    if (hashes.length === 0) {
      return new Map();
    }

    const hashSet = new Set(hashes);
    const map = new Map<string, string[]>();
    const existing = await this.getAllChunks(scopeId);

    for (const chunk of existing) {
      const hash = (chunk.metadata?.fileHash as string | undefined) ?? '';
      if (!hash || !hashSet.has(hash)) {
        continue;
      }
      const ids = map.get(hash) ?? [];
      ids.push(chunk.chunkId);
      map.set(hash, ids);
    }

    return map;
  }

  private async getChunkIdsByPaths(scopeId: string, paths: string[]): Promise<Map<string, string[]>> {
    if (paths.length === 0) {
      return new Map();
    }

    const pathSet = new Set(paths.map(path => path.replace(/\\/g, '/')));
    const existing = await this.getAllChunks(scopeId);
    const pathToChunkIds = new Map<string, string[]>();

    for (const chunk of existing) {
      const normalizedPath = chunk.path.replace(/\\/g, '/');
      if (!pathSet.has(normalizedPath)) {
        continue;
      }

      const chunkIds = pathToChunkIds.get(normalizedPath) ?? [];
      chunkIds.push(chunk.chunkId);
      pathToChunkIds.set(normalizedPath, chunkIds);
    }

    return pathToChunkIds;
  }

  private async deleteBatch(scopeId: string, chunkIds: string[]): Promise<number> {
    if (chunkIds.length === 0) {
      return 0;
    }

    const toDelete = new Set(chunkIds);
    const existing = await this.getAllChunks(scopeId);
    const filtered = existing.filter(chunk => !toDelete.has(chunk.chunkId));
    const deleted = existing.length - filtered.length;
    if (deleted > 0) {
      await this.replaceScope(scopeId, filtered);
    }
    return deleted;
  }
}
