/**
 * @module @kb-labs/core-registry
 * Unified entity registry for the KB Labs platform.
 *
 * All services (CLI, REST API, Workflow) import from this package
 * instead of the old @kb-labs/cli-api.
 */

import { EntityRegistry } from './registry.js';
import type { RegistryOptions, IEntityRegistry } from './types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createRegistry(opts?: RegistryOptions): Promise<IEntityRegistry> {
  const registry = new EntityRegistry(opts ?? {});
  await registry.initialize();
  return registry;
}

// ---------------------------------------------------------------------------
// Core class
// ---------------------------------------------------------------------------

export { EntityRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Entity catalog
// ---------------------------------------------------------------------------

export { EntityCatalog } from './catalog/entity-catalog.js';
export type { EntityExtractor } from './catalog/extractors.js';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export { generateOpenAPISpec, mergeOpenAPISpecs } from './generators/openapi-spec.js';
export { generateStudioRegistry } from './generators/studio-registry.js';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export { SnapshotManager } from './snapshot/snapshot-manager.js';

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export { HealthAggregator, resetGitInfoCache } from './health/health-aggregator.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export {
  loadPluginsState,
  savePluginsState,
  isPluginEnabled,
  enablePlugin,
  disablePlugin,
  recordCrash,
  computePackageIntegrity,
} from './state/plugin-state.js';
export type { PluginState } from './state/plugin-state.js';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export { buildDiagnosticReport, formatDiagnosticReport } from './diagnostics/reporter.js';

// ---------------------------------------------------------------------------
// Types (public API)
// ---------------------------------------------------------------------------

export type {
  // Registry interface
  IEntityRegistry,
  RegistryOptions,
  // Entity model
  EntityKind,
  EntitySignature,
  EntityRef,
  EntityEntry,
  EntityFilter,
  // Plugin
  PluginBrief,
  RegistryDiff,
  // Snapshot
  RegistrySnapshot,
  RegistrySnapshotManifestEntry,
  // Health
  SystemHealthSnapshot,
  SystemHealthOptions,
  GitInfo,
  // Generators
  OpenAPISpec,
  StudioRegistry,
  StudioRegistryEntry,
  // Diagnostics
  DiagnosticReport,
  DiagnosticEvent,
  DiagnosticSeverity,
  DiagnosticCode,
} from './types.js';
