/**
 * @module @kb-labs/studio-data-client/sources/platform-source
 * Platform configuration data source contract
 */

import type { PlatformConfigPayload } from '@kb-labs/rest-api-contracts';

/**
 * Platform configuration data source
 */
export interface PlatformDataSource {
  /**
   * Get platform configuration (adapters, options, execution mode)
   */
  getConfig(): Promise<PlatformConfigPayload>;
}
