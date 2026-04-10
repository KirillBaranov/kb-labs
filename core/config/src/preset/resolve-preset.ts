/**
 * @module @kb-labs/core/config/preset/resolve-preset
 * Org preset resolution with offline-first npm package loading
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { KbError, ERROR_HINTS } from '../errors/kb-error';
import { toFsProduct } from '../utils/product-normalize';

export interface PresetInfo {
  name: string;
  version: string;
  path: string;
  config: any;
}

/**
 * Resolve org preset package (offline-first)
 */
export async function resolvePreset(
  presetRef: string,
  cwd: string
): Promise<PresetInfo> {
  // Parse preset reference (e.g., "@kb-labs/org-preset@1.3.2")
  const [name, version] = parsePresetRef(presetRef);
  
  // Try local node_modules first (offline-first)
  const localPath = path.join(cwd, 'node_modules', name);
  try {
    const presetInfo = await loadPresetFromPath(localPath, name, version);
    if (presetInfo) {
      return presetInfo;
    }
  } catch {
    // Local preset not found, continue to network resolution
  }
  
  // Try network resolution (this would be implemented with npm/pnpm APIs)
  // For now, we'll throw an error if local resolution fails
  throw new KbError(
    'ERR_PRESET_NOT_RESOLVED',
    `Preset not found: ${presetRef}`,
    ERROR_HINTS.ERR_PRESET_NOT_RESOLVED,
    { presetRef, cwd }
  );
}

/**
 * Parse preset reference into name and version
 */
function parsePresetRef(presetRef: string): [string, string] {
  const atIndex = presetRef.lastIndexOf('@');
  if (atIndex === -1) {
    throw new KbError(
      'ERR_PRESET_REF_INVALID',
      `Invalid preset reference: ${presetRef}`,
      'Preset references must include version (e.g., @kb-labs/org-preset@1.3.2)',
      { presetRef }
    );
  }
  
  const name = presetRef.substring(0, atIndex);
  const version = presetRef.substring(atIndex + 1);
  
  if (!name || !version) {
    throw new KbError(
      'ERR_PRESET_REF_INVALID',
      `Invalid preset reference: ${presetRef}`,
      'Preset references must include both name and version',
      { presetRef }
    );
  }
  
  return [name, version];
}

/**
 * Load preset from local path
 */
async function loadPresetFromPath(
  presetPath: string,
  name: string,
  version: string
): Promise<PresetInfo | null> {
  try {
    // Check if preset directory exists
    await fsp.access(presetPath);
    
    // Load package.json to verify version
    const packageJsonPath = path.join(presetPath, 'package.json');
    const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf-8'));
    
    // Verify version matches (supports semver ranges)
    if (!versionMatches(packageJson.version, version)) {
      return null;
    }
    
    // Load preset config
    const configPath = path.join(presetPath, 'config.defaults.json');
    const config = JSON.parse(await fsp.readFile(configPath, 'utf-8'));
    
    return {
      name,
      version: packageJson.version,
      path: presetPath,
      config,
    };
  } catch {
    return null;
  }
}

/**
 * Check if version matches (simple semver range support)
 */
function versionMatches(actualVersion: string, requiredVersion: string): boolean {
  // Simple exact match for now
  // TODO: Implement proper semver range matching
  if (requiredVersion.startsWith('^')) {
    const major = requiredVersion.substring(1).split('.')[0];
    const actualMajor = actualVersion.split('.')[0];
    return major === actualMajor;
  }
  
  return actualVersion === requiredVersion;
}

/**
 * Get preset config for a specific product
 */
export function getPresetConfigForProduct(
  preset: PresetInfo,
  product: string
): any {
  const fsProduct = toFsProduct(product);
  return preset.config.products?.[fsProduct] || {};
}

/**
 * Get preset metadata
 */
export function getPresetMetadata(preset: PresetInfo): {
  name: string;
  version: string;
  path: string;
  products: string[];
} {
  return {
    name: preset.name,
    version: preset.version,
    path: preset.path,
    products: Object.keys(preset.config.products || {}),
  };
}
