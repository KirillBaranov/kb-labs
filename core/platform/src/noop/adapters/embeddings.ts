/**
 * @module @kb-labs/core-platform/noop/adapters/embeddings
 *
 * NoOp `IEmbeddings` — throws `AdapterUnavailableError` on use.
 *
 * Test doubles with deterministic vectors live in
 * `@kb-labs/shared-testing-platform/mocks` (MockEmbeddings).
 */

import { AdapterUnavailableError } from '../../errors.js';
import type { IEmbeddings } from '../../adapters/embeddings.js';

const SLOT = 'embeddings';

export class NoOpEmbeddings implements IEmbeddings {
  readonly dimensions = 0;

  async embed(_text: string): Promise<number[]> {
    throw new AdapterUnavailableError(SLOT);
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    throw new AdapterUnavailableError(SLOT);
  }

  async getDimensions(): Promise<number> {
    throw new AdapterUnavailableError(SLOT);
  }
}

/**
 * @deprecated Use `MockEmbeddings` from
 *   `@kb-labs/shared-testing-platform/mocks` for tests, or configure a
 *   real adapter for production. Kept here temporarily until consumers
 *   migrate; this re-export will be removed.
 */
export class MockEmbeddings implements IEmbeddings {
  readonly dimensions = 1536;

  private hash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
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
