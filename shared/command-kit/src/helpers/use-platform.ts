/**
 * @module @kb-labs/shared-command-kit/helpers/use-platform
 * Platform access hook with execution-scoped context.
 *
 * Uses AsyncLocalStorage to return the correct platform for the current
 * handler execution (governed, with correct permissions and proxy adapters).
 * Falls back to global singleton for code running outside handler context.
 *
 * @example
 * ```typescript
 * import { usePlatform } from '@kb-labs/shared-command-kit';
 *
 * // In any command handler — automatically gets the right platform
 * async handler(ctx, argv, flags) {
 *   const platform = usePlatform();
 *   const result = await platform.llm.complete('prompt');
 * }
 * ```
 */

import { platformContext } from '@kb-labs/plugin-contracts';
import { platform as globalPlatform } from '@kb-labs/core-runtime';

/**
 * Access platform services for the current execution context.
 *
 * Priority:
 * 1. AsyncLocalStorage context (set by runInProcess) — per-execution, governed
 * 2. Global singleton fallback (core-runtime) — for code outside handler context
 *
 * @returns Platform services with correct adapters for current context
 */
export function usePlatform(): typeof globalPlatform {
  return (platformContext.getStore() as typeof globalPlatform) ?? globalPlatform;
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
    return platform.hasAdapter(adapterName as string);
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
