/**
 * @module @kb-labs/core-platform/inmemory/adapters/config
 *
 * In-memory `IConfig` — empty config bag.
 *
 * Used as the default fallback when no config adapter is configured. All
 * `getConfig()` calls return `undefined` (NOT throw), matching the contract
 * "config not present means the product gets default behaviour". The raw
 * config blob is `{}`.
 *
 * If you need to seed test data, pass it via the constructor.
 */

import type { IConfig } from '../../adapters/config.js';

export class InMemoryConfig implements IConfig {
  private readonly raw: Record<string, unknown>;

  constructor(raw: Record<string, unknown> = {}) {
    this.raw = raw;
  }

  async getConfig(productId: string, _profileId?: string): Promise<unknown> {
    return this.raw[productId];
  }

  async getRawConfig(): Promise<unknown> {
    return this.raw;
  }
}
