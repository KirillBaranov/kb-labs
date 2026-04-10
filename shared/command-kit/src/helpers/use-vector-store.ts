/**
 * @module @kb-labs/shared-command-kit/helpers/use-vector-store
 * Global VectorStore access helper
 */

import { usePlatform } from './use-platform';
import type { IVectorStore } from '@kb-labs/core-platform';

/**
 * Access global VectorStore adapter
 *
 * Returns the platform vector store adapter (Qdrant, local, etc.).
 * Returns undefined if vectorStore is not configured (graceful degradation).
 *
 * @returns VectorStore adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * const vectorStore = useVectorStore();
 *
 * if (vectorStore) {
 *   await vectorStore.upsert([{ id: '1', vector: [0.1, 0.2], metadata: {} }]);
 *   const results = await vectorStore.search([0.1, 0.2], 10);
 * }
 * ```
 */
export function useVectorStore(): IVectorStore | undefined {
  const platform = usePlatform();
  return platform.vectorStore;
}

/**
 * Check if VectorStore is available
 *
 * @returns true if vectorStore is configured and ready
 *
 * @example
 * ```typescript
 * if (isVectorStoreAvailable()) {
 *   await vectorStore.upsert(records);
 * } else {
 *   // Use local fallback
 * }
 * ```
 */
export function isVectorStoreAvailable(): boolean {
  const vectorStore = useVectorStore();
  return !!vectorStore;
}
