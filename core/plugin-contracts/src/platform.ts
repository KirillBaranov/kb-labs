/**
 * Platform Services for V3 Plugin System
 *
 * Governed access to platform capabilities: LLM, embeddings, vector store, cache, storage, analytics.
 * In sandbox mode, these are RPC proxies to the parent process.
 *
 * IMPORTANT: V3 directly uses core platform contracts - no wrappers, no adapters.
 * Platform provides services, runtime just passes them through.
 *
 * PlatformServices is an alias for IPlatformAdapters — single source of truth.
 * Permission enforcement is handled by the governed wrapper, not by type restriction.
 */

import type { IPlatformAdapters } from '@kb-labs/core-platform';

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
// Platform Services
// ============================================================================

/**
 * Platform services type.
 *
 * Alias for IPlatformAdapters — the single source of truth for all platform adapter fields.
 * Plugins import this type; permission enforcement is handled by the governed wrapper at runtime.
 */
export type PlatformServices = IPlatformAdapters;
