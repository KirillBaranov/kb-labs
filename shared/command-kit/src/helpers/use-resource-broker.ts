/**
 * @module @kb-labs/shared-command-kit/helpers/use-resource-broker
 * Global ResourceBroker access helper
 *
 * Provides clean access to ResourceBroker for queue and rate limiting.
 *
 * @example
 * ```typescript
 * import { useResourceBroker } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const broker = useResourceBroker();
 *
 *   // Get statistics
 *   const stats = broker.getStats();
 *   console.log(`Queue size: ${stats.queueSize}`);
 * }
 * ```
 */

import { usePlatform } from './use-platform.js';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';

/**
 * Access global ResourceBroker
 *
 * Returns the platform ResourceBroker for queue management, rate limiting,
 * and retry logic for heavy operations (LLM, embeddings, vector store).
 *
 * **Features:**
 * - Priority queue (high/normal/low)
 * - Rate limiting with configurable backend
 * - Automatic retry with exponential backoff
 * - Per-resource statistics
 *
 * **Note:** Most plugins don't need this directly.
 * Use `useLLM()`, `useEmbeddings()`, etc. which automatically
 * route through the ResourceBroker.
 *
 * @returns ResourceBroker instance
 * @throws Error if ResourceBroker not initialized
 *
 * @example
 * ```typescript
 * const broker = useResourceBroker();
 *
 * // Get queue statistics
 * const stats = broker.getStats();
 * console.log(`Total requests: ${stats.totalRequests}`);
 * console.log(`Queue size: ${stats.queueSize}`);
 *
 * // Check if resource is registered
 * if (broker.hasResource('llm')) {
 *   console.log('LLM is available for queueing');
 * }
 * ```
 */
export function useResourceBroker(): IResourceBroker {
  const platform = usePlatform();
  return platform.resourceBroker;
}

/**
 * Check if ResourceBroker is available
 *
 * Useful for conditional logic when ResourceBroker may not be initialized.
 *
 * @returns true if ResourceBroker is initialized and ready
 *
 * @example
 * ```typescript
 * if (isResourceBrokerAvailable()) {
 *   const broker = useResourceBroker();
 *   const stats = broker.getStats();
 * } else {
 *   console.log('ResourceBroker not initialized');
 * }
 * ```
 */
export function isResourceBrokerAvailable(): boolean {
  const platform = usePlatform();
  return platform.hasResourceBroker;
}

/**
 * Get ResourceBroker statistics
 *
 * Convenience helper to get statistics without handling the broker directly.
 *
 * @returns ResourceBroker statistics or undefined if not available
 *
 * @example
 * ```typescript
 * const stats = getResourceBrokerStats();
 * if (stats) {
 *   console.log(`LLM requests: ${stats.resources.llm?.totalRequests ?? 0}`);
 *   console.log(`Queue size: ${stats.queueSize}`);
 * }
 * ```
 */
export function getResourceBrokerStats() {
  if (!isResourceBrokerAvailable()) {
    return undefined;
  }
  return useResourceBroker().getStats();
}
