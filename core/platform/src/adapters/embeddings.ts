/**
 * @module @kb-labs/core-platform/adapters/embeddings
 * Embeddings abstraction for text-to-vector conversion.
 */

/**
 * Embeddings adapter interface.
 * Implementations: @kb-labs/shared-openai (production), MockEmbeddings (noop)
 */
export interface IEmbeddings {
  /**
   * Generate embedding vector for a single text.
   * @param text - Input text
   * @returns Embedding vector
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embedding vectors for multiple texts.
   * @param texts - Array of input texts
   * @returns Array of embedding vectors (same order as input)
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Dimension of the embedding vectors.
   */
  readonly dimensions: number;

  /**
   * Get the dimensions of the embeddings.
   * This method is needed for IPC/Unix Socket transport to access the dimensions property.
   * Implementations should return the same value as the dimensions property.
   */
  getDimensions(): Promise<number>;
}
