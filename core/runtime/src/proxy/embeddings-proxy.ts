/**
 * @module @kb-labs/core-runtime/proxy
 * IPC proxy for IEmbeddings adapter.
 *
 * This proxy forwards all embeddings operations to the parent process via IPC.
 * The parent process owns the real embeddings adapter (e.g., OpenAIEmbeddings).
 *
 * Benefits:
 * - Single embeddings instance (shared rate limiter across all workers)
 * - Reduced memory usage (no duplicate API clients)
 * - Centralized quota enforcement (tenant rate limits)
 *
 * @example
 * ```typescript
 * import { EmbeddingsProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * // In child process (sandbox worker)
 * const transport = createIPCTransport();
 * const embeddings = new EmbeddingsProxy(transport);
 *
 * // Use like normal IEmbeddings
 * const vector = await embeddings.embed('Hello world');
 * const vectors = await embeddings.embedBatch(['foo', 'bar', 'baz']);
 * console.log('Dimensions:', embeddings.dimensions); // 1536
 * ```
 */

import type { IEmbeddings } from '@kb-labs/core-platform';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

/**
 * IPC proxy for IEmbeddings adapter.
 *
 * All method calls are forwarded to the parent process via IPC.
 * The parent process executes the call on the real embeddings adapter
 * (e.g., OpenAIEmbeddings) and returns the result.
 *
 * The `dimensions` property is fetched once during initialization
 * and cached locally for performance.
 */
export class EmbeddingsProxy extends RemoteAdapter<IEmbeddings> implements IEmbeddings {
  private _dimensions?: number;

  /**
   * Create an embeddings proxy.
   *
   * @param transport - IPC transport to communicate with parent
   * @param dimensions - Optional dimensions override (avoids IPC call)
   */
  constructor(transport: ITransport, dimensions?: number) {
    super('embeddings', transport);
    this._dimensions = dimensions;
  }

  /**
   * Generate embedding vector for a single text.
   *
   * @param text - Input text
   * @returns Embedding vector
   */
  async embed(text: string): Promise<number[]> {
    return (await this.callRemote('embed', [text])) as number[];
  }

  /**
   * Generate embedding vectors for multiple texts.
   *
   * @param texts - Array of input texts
   * @returns Array of embedding vectors (same order as input)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return (await this.callRemote('embedBatch', [texts])) as number[][];
  }

  /**
   * Dimension of the embedding vectors.
   *
   * This value is fetched once from the parent on first access
   * and cached locally for performance.
   */
  get dimensions(): number {
    if (this._dimensions === undefined) {
      throw new Error(
        'EmbeddingsProxy dimensions not initialized. ' +
          'Call getDimensions() first or pass dimensions to constructor.'
      );
    }
    return this._dimensions;
  }

  /**
   * Initialize dimensions by fetching from parent.
   *
   * This is called automatically by initPlatform() in child process.
   * If you create EmbeddingsProxy manually, call this method before
   * accessing the `dimensions` property.
   *
   * @returns Dimensions value
   *
   * @example
   * ```typescript
   * const proxy = new EmbeddingsProxy(transport);
   * await proxy.getDimensions(); // Fetch once
   * console.log(proxy.dimensions); // Now safe to access
   * ```
   */
  async getDimensions(): Promise<number> {
    if (this._dimensions === undefined) {
      // Fetch dimensions from parent via property access
      // We use a special 'getDimensions' method that the real adapter implements
      this._dimensions = (await this.callRemote('getDimensions', [])) as number;
    }
    return this._dimensions;
  }
}

/**
 * Create an Embeddings proxy with IPC transport.
 *
 * @param transport - IPC transport to use
 * @param dimensions - Optional dimensions override (avoids IPC call)
 * @returns Embeddings proxy instance
 *
 * @example
 * ```typescript
 * import { createEmbeddingsProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * const transport = createIPCTransport();
 * const embeddings = createEmbeddingsProxy(transport, 1536);
 * ```
 */
export function createEmbeddingsProxy(transport: ITransport, dimensions?: number): EmbeddingsProxy {
  return new EmbeddingsProxy(transport, dimensions);
}
