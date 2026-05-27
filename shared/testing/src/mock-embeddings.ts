/**
 * @module @kb-labs/shared-testing/mock-embeddings
 *
 * Deterministic in-memory `IEmbeddings` test double.
 *
 * Generates stable, normalised vectors from a text hash so tests that
 * need real math (cosine similarity, nearest-neighbour lookups) produce
 * reproducible results across runs — without any network call or model.
 *
 * @example
 * ```typescript
 * import { MockEmbeddings } from '@kb-labs/shared-testing';
 * const embed = new MockEmbeddings();
 * const vec = await embed.embed('hello');   // length === 1536, normalised
 * ```
 */

import type { IEmbeddings } from '@kb-labs/core-platform/adapters';

export class MockEmbeddings implements IEmbeddings {
  readonly dimensions = 1536;

  private hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h) + text.charCodeAt(i);
      h = h & h;
    }
    return h;
  }

  private generateVector(text: string): number[] {
    const seed = this.hash(text);
    const vec: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      vec.push(Math.sin(seed * (i + 1)) * 0.5);
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / mag);
  }

  async embed(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.generateVector(t));
  }

  async getDimensions(): Promise<number> {
    return this.dimensions;
  }
}
