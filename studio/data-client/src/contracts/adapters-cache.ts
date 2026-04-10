/**
 * @module @kb-labs/studio-data-client/contracts/adapters-cache
 * Cache adapter analytics contracts
 */

/**
 * Cache usage statistics
 */
export interface CacheUsageStats {
  totalGets: number;
  hits: number;
  misses: number;
  hitRate: number;
  sets: number;
  avgGetDuration: number;
  avgSetDuration: number;
}
