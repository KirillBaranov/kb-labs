/**
 * @module @kb-labs/core-discovery
 * Marketplace-based entity discovery for the KB Labs platform.
 *
 * All entities (plugins, adapters, widgets, skills, hooks, etc.) are registered
 * through the marketplace lock file (.kb/marketplace.lock).
 * There is no filesystem scanning — every entity must be explicitly installed.
 */

// Discovery manager
export { DiscoveryManager, extractEntityKinds } from './discovery-manager.js';
export type { DiscoveryOptions } from './discovery-manager.js';

// Marketplace lock CRUD
export {
  readMarketplaceLock,
  writeMarketplaceLock,
  addToMarketplaceLock,
  removeFromMarketplaceLock,
  createEmptyLock,
  createMarketplaceEntry,
  enablePlugin,
  disablePlugin,
} from './marketplace-lock.js';

// Manifest loader
export { loadManifest } from './manifest-loader.js';

// Integrity (SRI computation for marketplace entries)
export { computePackageIntegrity, parseIntegrity } from './integrity.js';

// Diagnostics
export { DiagnosticCollector } from './diagnostics.js';

// Types
export type {
  // Entity model
  EntityKind,
  EntitySignature,
  // Marketplace lock
  MarketplaceLock,
  MarketplaceEntry,
  // Discovery result
  DiscoveredPlugin,
  DiscoveryResult,
  // Diagnostics
  DiagnosticSeverity,
  DiagnosticEvent,
  DiagnosticCode,
} from './types.js';
