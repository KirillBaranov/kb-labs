/**
 * @module @kb-labs/core-runtime/proxy
 * IPC proxy for IVectorStore adapter.
 *
 * This proxy forwards all vector store operations to the parent process
 * via IPC. The parent process owns the real QdrantVectorStore instance.
 *
 * Benefits:
 * - Single QdrantVectorStore instance (shared across all sandbox workers)
 * - Reduced memory usage (no duplicate connections)
 * - Reduced connection count (5 instead of 250 for 50 workers)
 *
 * @example
 * ```typescript
 * import { VectorStoreProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * // In child process (sandbox worker)
 * const transport = createIPCTransport();
 * const vectorStore = new VectorStoreProxy(transport);
 *
 * // Use like normal IVectorStore
 * const results = await vectorStore.search([0.1, 0.2, 0.3], 10);
 * ```
 */

import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
} from '@kb-labs/core-platform';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';
import { BulkTransferHelper } from '../transport/bulk-transfer';
import { tmpdir } from 'os';

/**
 * IPC proxy for IVectorStore adapter.
 *
 * All method calls are forwarded to the parent process via IPC.
 * The parent process executes the call on the real vector store
 * (e.g., QdrantVectorStore) and returns the result.
 *
 * From the caller's perspective, this behaves identically to a
 * local vector store - the IPC layer is completely transparent.
 */
export class VectorStoreProxy extends RemoteAdapter<IVectorStore> implements IVectorStore {
  // Timeout for bulk operations that may trigger IPC backpressure
  private static readonly BULK_OPERATION_TIMEOUT = 120_000; // 2 minutes

  // BulkTransfer configuration
  private readonly bulkTransferOptions = {
    maxInlineSize: 1_000_000, // 1MB threshold
    tempDir: process.env.KB_TEMP_DIR ?? tmpdir(),
  };

  /**
   * Create a vector store proxy.
   *
   * @param transport - IPC transport to communicate with parent
   */
  constructor(transport: ITransport) {
    super('vectorStore', transport);
  }

  /**
   * Search for similar vectors.
   *
   * @param query - Query embedding vector
   * @param limit - Maximum number of results
   * @param filter - Optional metadata filter
   * @returns Promise resolving to search results
   */
  async search(
    query: number[],
    limit: number,
    filter?: VectorFilter
  ): Promise<VectorSearchResult[]> {
    return (await this.callRemote('search', [query, limit, filter])) as VectorSearchResult[];
  }

  /**
   * Insert or update vectors.
   * Uses BulkTransfer for large payloads to avoid IPC backpressure.
   *
   * @param vectors - Vector records to upsert
   */
  async upsert(vectors: VectorRecord[]): Promise<void> {
    // Smart serialization: inline for small, temp file for large
    const transfer = await BulkTransferHelper.serialize(vectors, this.bulkTransferOptions);
    await this.callRemote('upsert', [transfer], VectorStoreProxy.BULK_OPERATION_TIMEOUT);
  }

  /**
   * Delete vectors by IDs.
   * Uses extended timeout for bulk deletions.
   *
   * @param ids - Vector IDs to delete
   */
  async delete(ids: string[]): Promise<void> {
    await this.callRemote('delete', [ids], VectorStoreProxy.BULK_OPERATION_TIMEOUT);
  }

  /**
   * Upsert vectors with chunk metadata (used by Mind RAG).
   * Uses extended timeout for bulk operations.
   *
   * @param scope - Scope ID
   * @param vectors - Vector records to upsert
   */
  async upsertChunks(scope: string, vectors: VectorRecord[]): Promise<void> {
    await this.callRemote('upsertChunks', [scope, vectors], VectorStoreProxy.BULK_OPERATION_TIMEOUT);
  }

  /**
   * Count total vectors in collection.
   *
   * @returns Promise resolving to vector count
   */
  async count(): Promise<number> {
    return (await this.callRemote('count', [])) as number;
  }

  /**
   * Get vectors by IDs.
   * IDs argument is usually small, passed directly through IPC.
   * Uses BulkTransfer only for large result sets.
   *
   * @param ids - Vector IDs to retrieve
   * @returns Promise resolving to vector records
   */
  async get(ids: string[]): Promise<VectorRecord[]> {
    // Small IDs array - pass directly (no BulkTransfer for argument)
    const resultTransfer = await this.callRemote('get', [ids], VectorStoreProxy.BULK_OPERATION_TIMEOUT);

    // Large result - deserialize if it's BulkTransfer
    if (BulkTransferHelper.isBulkTransfer(resultTransfer)) {
      return BulkTransferHelper.deserialize<VectorRecord[]>(resultTransfer);
    }
    return resultTransfer as VectorRecord[];
  }

  /**
   * Query vectors by metadata filter.
   * Filter argument is small, passed directly through IPC.
   * Uses BulkTransfer only for potentially large result sets.
   *
   * @param filter - Metadata filter to apply
   * @returns Promise resolving to matching vector records
   */
  async query(filter: VectorFilter): Promise<VectorRecord[]> {
    // Small filter - pass directly (no BulkTransfer for argument)
    const resultTransfer = await this.callRemote('query', [filter], VectorStoreProxy.BULK_OPERATION_TIMEOUT);

    // Large result - deserialize if it's BulkTransfer
    if (BulkTransferHelper.isBulkTransfer(resultTransfer)) {
      return BulkTransferHelper.deserialize<VectorRecord[]>(resultTransfer);
    }
    return resultTransfer as VectorRecord[];
  }

  /**
   * Clear all vectors from collection.
   * Uses extended timeout for bulk deletion.
   */
  async clear(): Promise<void> {
    await this.callRemote('clear', [], VectorStoreProxy.BULK_OPERATION_TIMEOUT);
  }

  /**
   * Initialize the vector store.
   * Called during platform initialization.
   */
  async initialize(): Promise<void> {
    await this.callRemote('initialize', []);
  }

  /**
   * Close connections and cleanup resources.
   */
  async close(): Promise<void> {
    await this.callRemote('close', []);
  }
}

/**
 * Create a VectorStore proxy with IPC transport.
 *
 * @param transport - IPC transport to use
 * @returns VectorStore proxy instance
 *
 * @example
 * ```typescript
 * import { createVectorStoreProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * const transport = createIPCTransport();
 * const vectorStore = createVectorStoreProxy(transport);
 * ```
 */
export function createVectorStoreProxy(transport: ITransport): VectorStoreProxy {
  return new VectorStoreProxy(transport);
}
