/**
 * @kb-labs/sdk/hooks
 *
 * Stable platform hooks for plugin runtime code.
 * Keep this entrypoint backward-compatible across 1.x.
 */

export {
  usePlatform,
  isPlatformConfigured,
  useConfig,
  useLLM,
  isLLMAvailable,
  getLLMTier,
  useEmbeddings,
  isEmbeddingsAvailable,
  useVectorStore,
  isVectorStoreAvailable,
  useAnalytics,
  trackAnalyticsEvent,
  useLogger,
  useLoggerWithContext,
  useStorage,
  useCache,
  isCacheAvailable,
  useDocumentDatabase,
  isDocumentDatabaseAvailable,
  useKVStore,
  isKVStoreAvailable,
  useEnv,
  type LLMTier,
  type UseLLMOptions,
} from '@kb-labs/shared-command-kit';

// Adapter status — global registry, no plugin context needed.
// Returns the mode ('real' | 'inmemory' | 'noop') for each platform slot
// so plugins can branch on capability at runtime.
export {
  getAdapterStatus as useAdapterStatus,
  getAdapterStatusFor,
  type AdapterMode,
  type AdapterSlotStatus,
} from '@kb-labs/core-runtime';
