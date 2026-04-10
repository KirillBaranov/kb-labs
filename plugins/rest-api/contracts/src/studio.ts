/**
 * @module @kb-labs/rest-api-contracts/studio
 *
 * Studio V2 types for REST API.
 */

export type {
  StudioConfig,
  StudioPageEntry,
  StudioMenuEntry,
} from '@kb-labs/plugin-contracts';

// ============================================================================
// Registry V2
// ============================================================================

/**
 * Studio plugin entry in the registry.
 */
export interface StudioPluginEntryV2 {
  pluginId: string;
  displayName?: string;
  pluginVersion?: string;
  remoteName: string;
  /** Browser URL for loading remoteEntry.js (relative, proxied through gateway) */
  remoteEntryUrl: string;
  /** Absolute filesystem path to dist/widgets/ directory (server-side only, used by gateway) */
  widgetBundleDir: string;
  pages: import('@kb-labs/plugin-contracts').StudioPageEntry[];
  menus: import('@kb-labs/plugin-contracts').StudioMenuEntry[];
}

/**
 * GET /api/v1/studio/registry response.
 */
export interface StudioRegistryV2 {
  schema: 'kb.studio/2';
  schemaVersion: 2;
  generatedAt: string;
  plugins: StudioPluginEntryV2[];
}
