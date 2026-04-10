/**
 * @module @kb-labs/mind-engine/vector-store
 * Vector store factory and implementations
 */

export type {
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
  VectorStore,
} from './vector-store';

// Re-export EmbeddingVector for convenience
export type { EmbeddingVector } from './vector-store';

export { LocalVectorStore } from './local';
export type { LocalVectorStoreOptions } from './local';

// Re-export retry primitives so callers can customise retry behaviour
export { withRetry, isTransientError, calculateBackoffMs } from './retry';
export type { RetryOptions } from './retry';

import { LocalVectorStore } from './local';
import type { VectorStore } from './vector-store';
import { PlatformVectorStoreAdapter } from './platform-adapter';
import { usePlatform } from '@kb-labs/sdk';

export type VectorStoreType = 'local';

export interface VectorStoreConfig {
  type?: VectorStoreType;
  local?: {
    indexDir: string;
  };
}

/**
 * Create a vector store instance based on configuration
 */
export function createVectorStore(
  config: VectorStoreConfig,
): VectorStore {
  // Use SDK hook to get wrapped vectorStore with analytics
  const sdkPlatform = usePlatform();
  const vectorStore = sdkPlatform.vectorStore;

  if (vectorStore) {
    return new PlatformVectorStoreAdapter({
      vectorStore,
      storage: sdkPlatform.storage,
    });
  }

  const indexDir = config.local?.indexDir ?? '.kb/mind/indexes';
  return new LocalVectorStore({ indexDir });
}
