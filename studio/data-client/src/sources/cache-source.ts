/**
 * @module @kb-labs/studio-data-client/sources/cache-source
 * Cache management data source
 */

/**
 * Cache invalidation result
 */
export interface CacheInvalidationResult {
  invalidated: boolean;
  timestamp: string;
  previousRev: number | null;
  newRev: number;
  pluginsDiscovered: number;
}

/**
 * Cache data source interface
 */
export interface CacheDataSource {
  /**
   * Invalidate cache and force re-discovery
   */
  invalidateCache(): Promise<CacheInvalidationResult>;
}
