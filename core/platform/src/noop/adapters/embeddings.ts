/**
 * @module @kb-labs/core-platform/noop/adapters/embeddings
 * Mock embeddings implementation.
 */

import type { IEmbeddings } from '../../adapters/embeddings.js';

/**
 * Mock embeddings that generates deterministic vectors based on text hash.
 * Useful for testing without API calls.
 */
export class MockEmbeddings implements IEmbeddings {
  readonly dimensions = 1536;

  /**
   * Simple hash function for deterministic embedding generation.
   */
  private hash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Generate a deterministic vector based on text.
   */
  private generateVector(text: string): number[] {
    const seed = this.hash(text);
    const vector: number[] = [];

    for (let i = 0; i < this.dimensions; i++) {
      // Use seeded pseudo-random to generate consistent vectors
      const value = Math.sin(seed * (i + 1)) * 0.5;
      vector.push(value);
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / magnitude);
  }

  async embed(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateVector(text));
  }

  /**
   * Get the dimensions of the embeddings.
   * This method is needed for IPC/Unix Socket transport to access the dimensions property.
   */
  async getDimensions(): Promise<number> {
    return this.dimensions;
  }
}
