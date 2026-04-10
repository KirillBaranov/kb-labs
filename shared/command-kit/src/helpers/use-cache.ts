/**
 * @module @kb-labs/shared-command-kit/helpers/use-cache
 * Global Cache access helper
 *
 * Provides clean access to platform cache (Redis, InMemory, or custom adapter).
 *
 * @example
 * ```typescript
 * import { useCache } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const cache = useCache();
 *
 *   if (cache) {
 *     await cache.set('key', { data: 'value' }, 60000); // TTL: 60s
 *     const value = await cache.get('key');
 *     console.log(value);
 *   }
 * }
 * ```
 */

import { usePlatform } from './use-platform.js';
import type { ICache } from '@kb-labs/core-platform';

/**
 * Access global cache adapter
 *
 * Returns the platform cache adapter (Redis, InMemory, or custom).
 * Returns undefined if cache is not configured (graceful degradation).
 *
 * **Methods:**
 * - `cache.set(key, value, ttlMs?)` - Store value with optional TTL
 * - `cache.get<T>(key)` - Retrieve value by key
 * - `cache.delete(key)` - Remove value
 * - `cache.clear()` - Clear all cached values
 *
 * **Always check availability:**
 * ```typescript
 * const cache = useCache();
 * if (cache) {
 *   await cache.set('query-123', result, 60000);
 * } else {
 *   // No caching, compute every time
 * }
 * ```
 *
 * @returns Cache adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * const cache = useCache();
 *
 * if (cache) {
 *   // Check cache first
 *   const cached = await cache.get<QueryResult>('query-123');
 *   if (cached) {
 *     return cached;
 *   }
 *
 *   // Compute result
 *   const result = await expensiveQuery();
 *
 *   // Cache for 5 minutes
 *   await cache.set('query-123', result, 5 * 60 * 1000);
 *
 *   return result;
 * }
 * ```
 */
export function useCache(): ICache | undefined {
  const platform = usePlatform();
  return platform.cache;
}

/**
 * Check if cache is available
 *
 * Useful for conditional logic (cached vs non-cached execution).
 *
 * @returns true if cache is configured and ready
 *
 * @example
 * ```typescript
 * if (isCacheAvailable()) {
 *   // Use cached results
 *   const result = await getCachedOrCompute(key);
 * } else {
 *   // Compute every time
 *   const result = await compute();
 * }
 * ```
 */
export function isCacheAvailable(): boolean {
  const cache = useCache();
  return !!cache;
}
