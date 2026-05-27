/**
 * Platform Services for V3 Plugin System
 *
 * Two types define the service boundary:
 *
 * - `PluginServices`   — what plugin code can access (governed, sandboxed)
 * - `PlatformServices` — full surface for services/infrastructure (superset)
 *
 * Governance (`applyPluginGovernance`) always returns `PluginServices`.
 * Platform-only adapters (e.g. serviceTransport) extend `PlatformServices`
 * but are absent from `PluginServices` — TypeScript enforces this at compile time.
 */

import type { IPlatformAdapters, IPluginAdapters } from '@kb-labs/core-platform';

// Re-export core platform adapter interfaces directly
export type {
  ILogger as Logger,
  ICache as CacheAdapter,
  ILLM as LLMAdapter,
  IEmbeddings as EmbeddingsAdapter,
  IVectorStore as VectorStoreAdapter,
  IStorage as StorageAdapter,
  IAnalytics as AnalyticsAdapter,
  IEventBus as EventBusAdapter,
  // Re-export supporting types
  LLMOptions,
  LLMResponse,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
  EventHandler,
  Unsubscribe,
} from '@kb-labs/core-platform/adapters';

// ============================================================================
// Plugin Services — plugin-visible surface
// ============================================================================

/**
 * Adapter surface available to plugin code.
 *
 * This is what `ctx.platform` exposes. Governance returns this type.
 * Platform-only adapters are intentionally absent.
 */
export type PluginServices = IPluginAdapters;

// ============================================================================
// Platform Services — full surface for services/infrastructure
// ============================================================================

/**
 * Full adapter surface for services and infrastructure code.
 *
 * Superset of PluginServices. Gateway, workflow, rest-api receive this
 * at bootstrap. Never passed directly to plugin handlers.
 */
export type PlatformServices = IPlatformAdapters;
