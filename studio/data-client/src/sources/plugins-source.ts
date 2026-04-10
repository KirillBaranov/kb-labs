/**
 * Plugin registry data source interface
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

export interface PluginSource {
  /** Source kind (workspace, npm, etc.) */
  kind: string;
  /** Source path or location */
  path: string;
}

export interface PluginManifestEntry {
  /** Plugin ID (@scope/name) */
  pluginId: string;
  /** Full plugin manifest */
  manifest: ManifestV3;
  /** Absolute path to plugin root directory */
  pluginRoot: string;
  /** Source of the plugin */
  source: string | PluginSource;
  /** When the plugin was discovered (ISO timestamp) */
  discoveredAt?: string;
  /** When the plugin's dist/ was last built (ISO timestamp) */
  buildTimestamp?: string;
  /** Manifest validation result */
  validation?: {
    /** Whether the manifest is valid */
    valid: boolean;
    /** Validation errors (if any) */
    errors: string[];
  };
}

export interface PluginsRegistryResponse {
  /** List of discovered plugin manifests */
  manifests: PluginManifestEntry[];
  /** Base path for all REST API routes (e.g., /api/v1) */
  apiBasePath?: string;
}

export interface PluginAskRequest {
  /** The question to ask about the plugin */
  question: string;
}

export interface PluginAskResponse {
  /** LLM's answer */
  answer: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Data source for plugin registry operations
 */
export interface PluginsDataSource {
  /**
   * Get all discovered plugins with their manifests
   */
  getPlugins(): Promise<PluginsRegistryResponse>;

  /**
   * Ask AI a question about a specific plugin
   */
  askAboutPlugin(pluginId: string, request: PluginAskRequest): Promise<PluginAskResponse>;
}
