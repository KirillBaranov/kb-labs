/**
 * @module @kb-labs/studio-data-client/sources/http-cache-source
 * HTTP implementation of CacheDataSource
 */

import type { HttpClient } from '../client/http-client';
import type { CacheDataSource, CacheInvalidationResult } from './cache-source';

/**
 * HTTP implementation of CacheDataSource
 */
export class HttpCacheSource implements CacheDataSource {
  constructor(private client: HttpClient) {}

  async invalidateCache(): Promise<CacheInvalidationResult> {
    return this.client.fetch<CacheInvalidationResult>('/cache/invalidate', {
      method: 'POST',
      // No Content-Type header needed for empty body POST
    });
  }
}
