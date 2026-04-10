/**
 * @module @kb-labs/shared-command-kit/helpers/use-config
 * Global config access helper
 *
 * Provides clean access to product-specific configuration without context drilling.
 * Similar to React hooks pattern, but for KB Labs config.
 *
 * @example
 * ```typescript
 * import { useConfig } from '@kb-labs/shared-command-kit';
 *
 * // In any command handler
 * async handler(ctx, argv, flags) {
 *   const config = await useConfig('mind');
 *
 *   if (config) {
 *     const scopes = config.scopes;
 *     // Use config...
 *   }
 * }
 * ```
 */

/**
 * Access product-specific configuration from kb.config.json
 *
 * Returns ONLY the config for the specified product and profile.
 * Uses platform.config adapter (works across parent/child processes via IPC).
 * Supports both Profiles v2 and legacy config structures.
 *
 * **Security:** This function returns ONLY the product-specific config,
 * not the entire kb.config.json. This prevents cross-product config access.
 *
 * **Auto-detection:** If productId is not provided, it's automatically inferred
 * from the plugin's manifest.configSection field (passed via execution context).
 *
 * **Profiles v2 structure:**
 * ```json
 * {
 *   "profiles": [
 *     {
 *       "id": "default",
 *       "products": {
 *         "mind": { "scopes": [...] },
 *         "workflow": { "maxConcurrency": 10 }
 *       }
 *     }
 *   ]
 * }
 * ```
 *
 * **Legacy structure:**
 * ```json
 * {
 *   "knowledge": { "scopes": [...] },  // for "mind" product
 *   "workflow": { "maxConcurrency": 10 }
 * }
 * ```
 *
 * @param productId - Product identifier (e.g., 'mind', 'workflow', 'plugins'). Optional - auto-detected from context.
 * @param profileId - Profile identifier (defaults to 'default' or KB_PROFILE env var)
 * @returns Promise resolving to product-specific config or undefined
 *
 * @example
 * ```typescript
 * // Auto-detect from context (recommended)
 * const config = await useConfig();
 *
 * // Explicit product ID
 * const mindConfig = await useConfig('mind');
 * if (mindConfig?.scopes) {
 *   // Use scopes
 * }
 *
 * // With explicit profile
 * const workflowConfig = await useConfig('workflow', 'production');
 * ```
 */
export async function useConfig<T = any>(productId?: string, profileId?: string): Promise<T | undefined> {
  // Auto-detect productId from manifest.configSection if not provided
  let effectiveProductId = productId;
  if (!effectiveProductId) {
    effectiveProductId = (globalThis as any).__KB_CONFIG_SECTION__;
  }

  if (!effectiveProductId) {
    return undefined;
  }

  const { usePlatform } = await import('./use-platform.js');
  const platform = usePlatform();

  if (!platform) {
    return undefined;
  }

  // Returns ONLY the product-specific config, not the entire kb.config.json
  return await platform.config.getConfig(effectiveProductId, profileId) as T | undefined;
}
