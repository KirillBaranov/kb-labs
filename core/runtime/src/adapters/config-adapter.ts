/**
 * @module @kb-labs/core-runtime/adapters/config-adapter
 * Real config adapter implementation (runs in parent process).
 */

import type { IConfig } from '@kb-labs/core-platform';

/**
 * ConfigAdapter - Real implementation that accesses globalThis.__KB_RAW_CONFIG__.
 *
 * This adapter runs ONLY in the parent process (CLI bin).
 * Child processes use ConfigProxy which calls this via IPC.
 *
 * @example
 * ```typescript
 * // In parent process (loader.ts):
 * const configAdapter = new ConfigAdapter();
 * platform.setAdapter('config', configAdapter);
 *
 * // In command handler:
 * const mindConfig = await platform.config.getConfig('mind');
 * ```
 */
export class ConfigAdapter implements IConfig {
  /**
   * Get product-specific configuration.
   * Extracts configuration for a specific product from the global config.
   * Supports both Profiles v2 and legacy config structures.
   *
   * @param productId - Product identifier (e.g., 'mind', 'workflow', 'plugins')
   * @param profileId - Profile identifier (defaults to 'default' or KB_PROFILE env var)
   * @returns Product-specific config or undefined if not found
   *
   * @example
   * ```typescript
   * // Mind product
   * const mindConfig = await config.getConfig('mind');
   * if (mindConfig?.scopes) {
   *   // Use scopes
   * }
   *
   * // Workflow product with explicit profile
   * const workflowConfig = await config.getConfig('workflow', 'production');
   * ```
   */
  async getConfig(productId: string, profileId?: string): Promise<any> {
    // Access rawConfig from globalThis (set by bootstrap.ts)
    const rawConfig = (globalThis as any).__KB_RAW_CONFIG__;

    if (!rawConfig) {
      return undefined;
    }

    const effectiveProfileId = profileId ?? process.env.KB_PROFILE ?? 'default';

    // Try profiles v2 structure first
    if (rawConfig.profiles && Array.isArray(rawConfig.profiles)) {
      const profile = rawConfig.profiles.find((p: any) => p.id === effectiveProfileId) ?? rawConfig.profiles[0];
      if (profile?.products?.[productId]) {
        return profile.products[productId];
      }
    }

    // Fallback to legacy structure
    // Map productId to legacy key (e.g., 'mind' → 'knowledge')
    const legacyKeyMap: Record<string, string> = {
      'mind': 'knowledge',
    };

    const legacyKey = legacyKeyMap[productId] ?? productId;
    if (rawConfig[legacyKey]) {
      return rawConfig[legacyKey];
    }

    return undefined;
  }

  /**
   * Get raw kb.config.json data.
   * Returns the entire config object without any product/profile extraction.
   * Useful for custom config parsing or when you need access to multiple products.
   *
   * @returns Raw config object or undefined if not loaded
   *
   * @example
   * ```typescript
   * const rawConfig = await config.getRawConfig();
   * if (rawConfig) {
   *   // Access any part of config
   *   const allProfiles = rawConfig.profiles;
   * }
   * ```
   */
  async getRawConfig(): Promise<any> {
    return (globalThis as any).__KB_RAW_CONFIG__;
  }
}
