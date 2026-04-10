/**
 * @module @kb-labs/studio-data-client/mocks/mock-cache-source
 * Mock implementation of CacheDataSource
 */

import type { CacheDataSource, CacheInvalidationResult } from '../sources/cache-source';

/**
 * Mock implementation of CacheDataSource
 */
export class MockCacheSource implements CacheDataSource {
  async invalidateCache(): Promise<CacheInvalidationResult> {
    // Simulate cache invalidation
    return {
      invalidated: true,
      timestamp: new Date().toISOString(),
      previousRev: 1,
      newRev: 2,
      pluginsDiscovered: 4,
    };
  }
}
