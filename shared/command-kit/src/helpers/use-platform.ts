/**
 * @module @kb-labs/shared-command-kit/helpers/use-platform
 * Global platform singleton access helper
 *
 * Provides clean access to platform services without context drilling.
 * Similar to React hooks pattern, but for KB Labs platform.
 *
 * @example
 * ```typescript
 * import { usePlatform } from '@kb-labs/shared-command-kit';
 *
 * // In any command handler
 * async handler(ctx, argv, flags) {
 *   const platform = usePlatform();
 *
 *   if (platform.llm) {
 *     const result = await platform.llm.complete('prompt');
 *   }
 *
 *   await platform.logger.info('Task completed');
 * }
 * ```
 */

import { platform as globalPlatform } from '@kb-labs/core-runtime';

/**
 * Access global platform singleton
 *
 * Returns the initialized platform object with all registered adapters.
 * This is the single source of truth for platform services.
 *
 * **What's available:**
 * - `platform.llm` - LLM adapter (OpenAI, Anthropic, etc.)
 * - `platform.embeddings` - Embeddings adapter
 * - `platform.vectorStore` - Vector storage (Qdrant, local, etc.)
 * - `platform.storage` - File/blob storage
 * - `platform.cache` - Caching layer
 * - `platform.analytics` - Analytics/telemetry
 * - `platform.logger` - Structured logging
 * - `platform.eventBus` - Event system
 * - `platform.workflows` - Workflow engine
 * - `platform.jobs` - Background jobs
 * - `platform.cron` - Scheduled tasks
 * - `platform.resources` - Resource management
 * - `platform.invoke` - Plugin invocation
 * - `platform.artifacts` - Build artifacts
 *
 * **Graceful degradation:**
 * Always check if adapter is available before using:
 * ```typescript
 * const platform = usePlatform();
 * if (platform.llm) {
 *   // Use LLM
 * } else {
 *   // Fallback logic
 * }
 * ```
 *
 * **Multi-tenancy:**
 * Currently returns global singleton (single-tenant).
 * Future: Will support tenant-scoped platform via AsyncLocalStorage.
 *
 * @returns Global platform singleton
 */
export function usePlatform(): typeof globalPlatform {
  return globalPlatform;
}

/**
 * Check if specific platform adapter is configured
 *
 * Useful for conditional logic based on available services.
 *
 * @param adapterName - Name of the adapter to check
 * @returns true if adapter is configured and available
 *
 * @example
 * ```typescript
 * if (isPlatformConfigured('llm')) {
 *   // Use LLM-powered feature
 * } else {
 *   // Use deterministic fallback
 * }
 * ```
 */
export function isPlatformConfigured(adapterName: keyof typeof globalPlatform): boolean {
  const platform = usePlatform();

  // Check if adapter exists and is not a noop/fallback
  const adapter = platform[adapterName];

  if (!adapter) {
    return false;
  }

  // For adapters with hasAdapter method (like platform itself)
  if ('hasAdapter' in platform && typeof platform.hasAdapter === 'function') {
    return platform.hasAdapter(adapterName as any);
  }

  // Fallback: check if adapter is not noop
  // Noop adapters usually have a specific constructor name or are simple objects
  if (typeof adapter === 'object' && adapter.constructor) {
    const constructorName = adapter.constructor.name;
    return !constructorName.toLowerCase().includes('noop') &&
           !constructorName.toLowerCase().includes('fallback');
  }

  return true;
}
