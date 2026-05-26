/**
 * @module @kb-labs/core-platform/noop/adapters/embeddings
 *
 * NoOp `IEmbeddings` — throws `AdapterUnavailableError` on use.
 *
 * Deterministic test doubles live in `@kb-labs/shared-testing` (MockEmbeddings).
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
