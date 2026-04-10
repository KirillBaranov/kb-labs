/**
 * @module @kb-labs/core-platform/noop/adapters/config
 * NoOp config implementation.
 */

import type { IConfig } from '../../adapters/config.js';

/**
 * NoOp config - returns undefined for all queries.
 * Safe fallback when no config is loaded.
 */
export class NoOpConfig implements IConfig {
  async getConfig(_productId: string, _profileId?: string): Promise<any> {
    return undefined;
  }

  async getRawConfig(): Promise<any> {
    return undefined;
  }
}
