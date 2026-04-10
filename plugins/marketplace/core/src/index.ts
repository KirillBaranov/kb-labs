/**
 * @module @kb-labs/marketplace-core
 * Unified marketplace service for KB Labs platform.
 */

export { MarketplaceService } from './marketplace-service.js';
export type { MarketplaceServiceOptions } from './marketplace-service.js';

export {
  readManifestCache,
  writeManifestCache,
  createEmptyManifestCache,
  setCacheEntry,
  removeCacheEntry,
} from './manifest-cache.js';

export { PluginStrategy, AdapterStrategy } from './strategies/index.js';
