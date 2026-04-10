/**
 * @module @kb-labs/rest-api-core/studio-registry
 *
 * Transforms ManifestV3 studio sections into StudioRegistryV2 format.
 *
 * Each plugin entry includes:
 * - remoteEntryUrl: browser-facing URL (proxied through gateway)
 * - widgetBundleDir: absolute filesystem path to dist/widgets/ (used by gateway to serve files)
 */

import { join } from 'node:path';
import { statSync } from 'node:fs';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { StudioRegistryV2, StudioPluginEntryV2 } from '@kb-labs/rest-api-contracts';

function getRemoteEntryVersion(widgetBundleDir: string): string {
  try {
    const stat = statSync(join(widgetBundleDir, 'remoteEntry.js'));
    return String(Math.floor(stat.mtimeMs));
  } catch {
    return '0';
  }
}

/**
 * Convert a single ManifestV3 with studio V2 config to a registry entry.
 *
 * @param manifest - Plugin manifest with studio V2 config
 * @param pluginRoot - Absolute path to the plugin package root (where package.json lives)
 */
export function manifestToRegistryEntry(
  manifest: ManifestV3,
  pluginRoot: string,
): StudioPluginEntryV2 | null {
  const studio = manifest.studio;
  if (!studio || studio.version !== 2) {
    return null;
  }

  return {
    pluginId: manifest.id,
    displayName: manifest.display?.name,
    pluginVersion: manifest.version,
    remoteName: studio.remoteName,
    remoteEntryUrl: `/plugins/${manifest.id}/widgets/remoteEntry.js?v=${getRemoteEntryVersion(join(pluginRoot, 'dist', 'widgets'))}`,
    widgetBundleDir: join(pluginRoot, 'dist', 'widgets'),
    pages: studio.pages ?? [],
    menus: studio.menus ?? [],
  };
}

/**
 * Combine multiple manifests into a StudioRegistryV2.
 */
export function combineManifestsToRegistry(
  manifests: Array<{ manifest: ManifestV3; pluginRoot: string }>,
): StudioRegistryV2 {
  const plugins: StudioPluginEntryV2[] = [];

  for (const { manifest, pluginRoot } of manifests) {
    const entry = manifestToRegistryEntry(manifest, pluginRoot);
    if (entry) {
      plugins.push(entry);
    }
  }

  return {
    schema: 'kb.studio/2',
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plugins,
  };
}
