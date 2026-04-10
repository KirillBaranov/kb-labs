import type { StudioPageEntry, StudioMenuEntry } from '@kb-labs/plugin-contracts';

/**
 * A plugin entry in the runtime registry.
 */
export interface StudioPluginEntryV2 {
  pluginId: string;
  displayName?: string;
  pluginVersion?: string;
  remoteName: string;
  remoteEntryUrl: string;
  pages: StudioPageEntry[];
  menus: StudioMenuEntry[];
}

/**
 * Studio Registry V2 — returned by GET /api/v1/studio/registry.
 */
export interface StudioRegistryV2 {
  schema: 'kb.studio/2';
  schemaVersion: 2;
  generatedAt: string;
  plugins: StudioPluginEntryV2[];
}

export type { StudioPageEntry, StudioMenuEntry };
