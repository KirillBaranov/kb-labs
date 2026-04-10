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
  type LLMTier,
  type UseLLMOptions,
} from '@kb-labs/shared-command-kit';
