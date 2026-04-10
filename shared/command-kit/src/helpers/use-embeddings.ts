/**
 * @module @kb-labs/shared-command-kit/helpers/use-embeddings
 * Global Embeddings access helper
 */

import { usePlatform } from './use-platform';
import type { IEmbeddings } from '@kb-labs/core-platform';

/**
 * Access global Embeddings adapter
 *
 * Returns the platform embeddings adapter (OpenAI, etc.).
 * Returns undefined if embeddings is not configured (graceful degradation).
 *
 * @returns Embeddings adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * const embeddings = useEmbeddings();
 *
 * if (embeddings) {
 *   const vector = await embeddings.embed('Hello, world!');
 *   console.log(vector.length); // e.g., 1536 for OpenAI
 * }
 * ```
 */
export function useEmbeddings(): IEmbeddings | undefined {
  const platform = usePlatform();
  return platform.embeddings;
}

/**
 * Check if Embeddings is available
 *
 * @returns true if embeddings is configured and ready
 *
 * @example
 * ```typescript
 * if (isEmbeddingsAvailable()) {
 *   const vector = await embeddings.embed(text);
 * } else {
 *   // Use deterministic fallback
 * }
 * ```
 */
export function isEmbeddingsAvailable(): boolean {
  const embeddings = useEmbeddings();
  return !!embeddings;
}
