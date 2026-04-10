/**
 * @module @kb-labs/studio-data-client/sources/http-platform-source
 * HTTP implementation of PlatformDataSource
 */

import type { HttpClient } from '../client/http-client';
import type { PlatformDataSource } from './platform-source';
import type { PlatformConfigPayload } from '@kb-labs/rest-api-contracts';

/**
 * HTTP implementation of PlatformDataSource
 */
export class HttpPlatformSource implements PlatformDataSource {
  constructor(private client: HttpClient) {}

  /**
   * Get platform configuration
   */
  async getConfig(): Promise<PlatformConfigPayload> {
    // Envelope is already unwrapped by envelope interceptor
    return this.client.fetch<PlatformConfigPayload>('/platform/config');
  }
}
