/**
 * @module @kb-labs/core-resource-broker/wrappers/queued-vector-store
 * QueuedVectorStore - IVectorStore wrapper that routes requests through ResourceBroker.
 */

import type {
  IVectorStore,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
} from '@kb-labs/core-platform';
import type { IResourceBroker, ResourcePriority } from '../types.js';

/**
 * Options for queued vector store operations.
 */
export interface QueuedVectorStoreOptions {
  /** Request priority (default: 'normal') */
  priority?: ResourcePriority;
}

/**
 * IVectorStore wrapper that routes requests through ResourceBroker.
 *
 * Features:
 * - Transparent integration (implements IVectorStore interface)
 * - Rate limiting for batch operations
 * - Priority support for different use cases
 * - Search operations prioritized over bulk upserts
 *
 * @example
 * ```typescript
 * const queuedVectorStore = new QueuedVectorStore(broker, realVectorStore);
 *
 * // Search (typically high priority)
 * const results = await queuedVectorStore.search(queryVector, 10);
 *
 * // Bulk upsert (typically normal/low priority)
 * await queuedVectorStore.upsert(vectors);
 * ```
 */
export class QueuedVectorStore implements IVectorStore {
  private _priority: ResourcePriority = 'normal';

  constructor(
    private broker: IResourceBroker,
    private realVectorStore: IVectorStore
  ) {}

  /**
   * Set default priority for subsequent operations.
   *
   * @param priority - Priority level
   * @returns this for chaining
   */
  withPriority(priority: ResourcePriority): this {
    this._priority = priority;
    return this;
  }

  /**
   * Search for similar vectors through the queue.
   *
   * @param query - Query embedding vector
   * @param limit - Maximum number of results
   * @param filter - Optional metadata filter
   * @returns Search results
   * @throws Error if request fails after all retries
   */
  async search(
    query: number[],
    limit: number,
    filter?: VectorFilter
  ): Promise<VectorSearchResult[]> {
    const response = await this.broker.enqueue<VectorSearchResult[]>({
      resource: 'vectorStore',
      operation: 'search',
      args: [query, limit, filter],
      priority: this._priority,
      // No token estimation for vector operations
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore search failed');
    }

    return response.data!;
  }

  /**
   * Upsert vectors through the queue.
   *
   * @param vectors - Array of vector records to upsert
   * @throws Error if request fails after all retries
   */
  async upsert(vectors: VectorRecord[]): Promise<void> {
    const response = await this.broker.enqueue<void>({
      resource: 'vectorStore',
      operation: 'upsert',
      args: [vectors],
      priority: this._priority,
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore upsert failed');
    }
  }

  /**
   * Delete vectors through the queue.
   *
   * @param ids - Array of vector IDs to delete
   * @throws Error if request fails after all retries
   */
  async delete(ids: string[]): Promise<void> {
    const response = await this.broker.enqueue<void>({
      resource: 'vectorStore',
      operation: 'delete',
      args: [ids],
      priority: this._priority,
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore delete failed');
    }
  }

  /**
   * Get total count of vectors through the queue.
   *
   * @returns Vector count
   * @throws Error if request fails after all retries
   */
  async count(): Promise<number> {
    const response = await this.broker.enqueue<number>({
      resource: 'vectorStore',
      operation: 'count',
      args: [],
      priority: this._priority,
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore count failed');
    }

    return response.data!;
  }

  /**
   * Get vectors by IDs through the queue (if supported).
   *
   * @param ids - Array of vector IDs to retrieve
   * @returns Array of vector records
   * @throws Error if request fails or method not supported
   */
  async get(ids: string[]): Promise<VectorRecord[]> {
    if (!this.realVectorStore.get) {
      throw new Error('VectorStore.get() not supported by underlying implementation');
    }

    const response = await this.broker.enqueue<VectorRecord[]>({
      resource: 'vectorStore',
      operation: 'get',
      args: [ids],
      priority: this._priority,
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore get failed');
    }

    return response.data!;
  }

  /**
   * Query vectors by filter through the queue (if supported).
   *
   * @param filter - Metadata filter to apply
   * @returns Array of matching vector records
   * @throws Error if request fails or method not supported
   */
  async query(filter: VectorFilter): Promise<VectorRecord[]> {
    if (!this.realVectorStore.query) {
      throw new Error('VectorStore.query() not supported by underlying implementation');
    }

    const response = await this.broker.enqueue<VectorRecord[]>({
      resource: 'vectorStore',
      operation: 'query',
      args: [filter],
      priority: this._priority,
    });

    if (!response.success) {
      throw response.error ?? new Error('VectorStore query failed');
    }

    return response.data!;
  }
}

/**
 * Create a QueuedVectorStore wrapper.
 *
 * @param broker - ResourceBroker instance
 * @param vectorStore - Real IVectorStore implementation
 * @returns Wrapped IVectorStore that routes through broker
 */
export function createQueuedVectorStore(
  broker: IResourceBroker,
  vectorStore: IVectorStore
): QueuedVectorStore {
  return new QueuedVectorStore(broker, vectorStore);
}
