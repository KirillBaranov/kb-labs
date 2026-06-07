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
    effectiveProductId = (globalThis as typeof globalThis & { __KB_CONFIG_SECTION__?: string }).__KB_CONFIG_SECTION__;
  }

  if (!effectiveProductId) {
    return undefined;
  }

  // ── EXPLICIT OVERRIDE (2026-06-07) ──────────────────────────────────────────
  // Config is read DIRECTLY from the global the service already loaded
  // (`service-bootstrap` sets `__KB_RAW_CONFIG__` / `__KB_EFFECTIVE_CONFIG__`),
  // NOT through the `platform.config` adapter.
  //
  // Rationale: in-process the adapter was pure indirection over this same global,
  // and on the isolated/worker path it crashed — config is attached post-assembly
  // only on the parent path, so `platform.config` was undefined in worker handlers
  // (the "F2" bug). The global IS populated even in those workers, so reading it
  // directly is correct AND removes the adapter from the hot path.
  //
  // The `platform.config` proxy is kept ONLY as a fallback for a genuinely remote
  // worker that has no shared memory (future client/server execution).
  // ────────────────────────────────────────────────────────────────────────────
  const g = globalThis as typeof globalThis & {
    __KB_EFFECTIVE_CONFIG__?: Record<string, unknown>;
    __KB_RAW_CONFIG__?: Record<string, unknown>;
  };
  const rawConfig = g.__KB_EFFECTIVE_CONFIG__ ?? g.__KB_RAW_CONFIG__;

  if (rawConfig) {
    return selectProductSection<T>(rawConfig, effectiveProductId, profileId);
  }

  // Fallback: no global in this process (genuinely remote/isolated worker without
  // shared memory) → use the platform.config IPC proxy if present.
  const { usePlatform } = await import('./use-platform.js');
  const platform = usePlatform();
  if (platform?.config) {
    return (await platform.config.getConfig(effectiveProductId, profileId)) as T | undefined;
  }

  return undefined;
}

/**
 * Select a product's config section from the raw kb.config.json object.
 *
 * Mirrors core-runtime `ConfigAdapter.getConfig`: Profiles v2 first
 * (`profiles[].products[productId]`), then the legacy flat structure
 * (top-level key, with the `mind` → `knowledge` alias). Returns ONLY the
 * product-specific section, never the whole config.
 */
function selectProductSection<T = any>(
  rawConfig: Record<string, unknown>,
  productId: string,
  profileId?: string,
): T | undefined {
  const effectiveProfileId = profileId ?? process.env.KB_PROFILE ?? 'default';

  // Profiles v2 structure
  const profilesField = (rawConfig as { profiles?: unknown }).profiles;
  if (Array.isArray(profilesField)) {
    type RawProfile = { id?: string; products?: Record<string, unknown> };
    const profiles = profilesField as RawProfile[];
    const profile = profiles.find((p) => p.id === effectiveProfileId) ?? profiles[0];
    if (profile?.products?.[productId] !== undefined) {
      return profile.products[productId] as T;
    }
  }

  // Legacy flat structure (mind → knowledge alias)
  const legacyKeyMap: Record<string, string> = { mind: 'knowledge' };
  const legacyKey = legacyKeyMap[productId] ?? productId;
  if (rawConfig[legacyKey] !== undefined) {
    return rawConfig[legacyKey] as T;
  }

  return undefined;
}
