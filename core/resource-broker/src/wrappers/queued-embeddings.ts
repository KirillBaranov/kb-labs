/**
 * @module @kb-labs/core-resource-broker/wrappers/queued-embeddings
 * QueuedEmbeddings - IEmbeddings wrapper that routes requests through ResourceBroker.
 */

import type { IEmbeddings } from '@kb-labs/core-platform';
import type { IResourceBroker, ResourcePriority } from '../types.js';
import { estimateTokens, estimateBatchTokens } from '../rate-limit/presets.js';

/**
 * Options for queued embeddings operations.
 */
export interface QueuedEmbeddingsOptions {
  /** Request priority (default: 'normal') */
  priority?: ResourcePriority;
}

/**
 * IEmbeddings wrapper that routes requests through ResourceBroker.
 *
 * Features:
 * - Transparent integration (implements IEmbeddings interface)
 * - Automatic token estimation for rate limiting
 * - Batch operations with proper token accounting
 * - Priority support for different use cases
 *
 * @example
 * ```typescript
 * const queuedEmbeddings = new QueuedEmbeddings(broker, realEmbeddings);
 *
 * // Single embedding
 * const vector = await queuedEmbeddings.embed("Hello world");
 *
 * // Batch embedding
 * const vectors = await queuedEmbeddings.embedBatch(["Hello", "World"]);
 * ```
 */
export class QueuedEmbeddings implements IEmbeddings {
  private _priority: ResourcePriority = 'normal';

  constructor(
    private broker: IResourceBroker,
    private realEmbeddings: IEmbeddings
  ) {}

  /**
   * Get embedding dimensions from the underlying implementation.
   */
  get dimensions(): number {
    return this.realEmbeddings.dimensions;
  }

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
   * Generate embedding vector for a single text through the queue.
   *
   * @param text - Input text
   * @returns Embedding vector
   * @throws Error if request fails after all retries
   */
  async embed(text: string): Promise<number[]> {
    const estimatedTokens = estimateTokens(text);

    const response = await this.broker.enqueue<number[]>({
      resource: 'embeddings',
      operation: 'embed',
      args: [text],
      priority: this._priority,
      estimatedTokens,
    });

    if (!response.success) {
      throw response.error ?? new Error('Embeddings request failed');
    }

    return response.data!;
  }

  /**
   * Generate embedding vectors for multiple texts through the queue.
   *
   * @param texts - Array of input texts
   * @returns Array of embedding vectors
   * @throws Error if request fails after all retries
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const estimatedTokens = estimateBatchTokens(texts);

    const response = await this.broker.enqueue<number[][]>({
      resource: 'embeddings',
      operation: 'embedBatch',
      args: [texts],
      priority: this._priority,
      estimatedTokens,
    });

    if (!response.success) {
      throw response.error ?? new Error('Embeddings batch request failed');
    }

    return response.data!;
  }

  /**
   * Get the dimensions of the embeddings.
   * This method is needed for IPC/Unix Socket transport to access the dimensions property.
   */
  async getDimensions(): Promise<number> {
    return this.realEmbeddings.dimensions;
  }
}

/**
 * Create a QueuedEmbeddings wrapper.
 *
 * @param broker - ResourceBroker instance
 * @param embeddings - Real IEmbeddings implementation
 * @returns Wrapped IEmbeddings that routes through broker
 */
export function createQueuedEmbeddings(
  broker: IResourceBroker,
  embeddings: IEmbeddings
): QueuedEmbeddings {
  return new QueuedEmbeddings(broker, embeddings);
}
