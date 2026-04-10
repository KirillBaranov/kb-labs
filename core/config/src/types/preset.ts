/**
 * @module @kb-labs/core/config/types/preset
 * Preset-related types
 */

export interface PresetConfig {
  products: Record<string, any>;
  metadata?: {
    name: string;
    version: string;
    description?: string;
  };
}

export interface PresetResolutionOptions {
  cwd: string;
  presetRef: string;
  offline?: boolean;
}

export interface PresetResolutionResult {
  preset: {
    name: string;
    version: string;
    path: string;
    config: PresetConfig;
  };
  resolvedAt: string;
}
