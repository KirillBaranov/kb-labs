/**
 * @kb-labs/cli-commands/registry
 * Plugin state management - read/write .kb/plugins.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resetInProcCache } from './discover';

export interface PluginState {
  enabled: string[];         // Package names that are explicitly enabled
  disabled: string[];       // Package names that are explicitly disabled
  linked: string[];         // Linked plugin paths (for local dev)
  permissions: Record<string, string[]>; // Package -> permissions granted
  integrity: Record<string, string>;     // Package -> SRI hash
  crashes: Record<string, number>;       // Package -> crash count (for quarantine)
  lastUpdated: number;
}

const DEFAULT_STATE: PluginState = {
  enabled: [],
  disabled: [],
  linked: [],
  permissions: {},
  integrity: {},
  crashes: {},
  lastUpdated: Date.now(),
};

/**
 * Get path to plugins.json
 */
export function getPluginsStatePath(cwd: string): string {
  return path.join(cwd, '.kb', 'plugins.json');
}

/**
 * Load plugin state from .kb/plugins.json
 */
export async function loadPluginsState(cwd: string): Promise<PluginState> {
  const statePath = getPluginsStatePath(cwd);
  
  try {
    const content = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(content) as Partial<PluginState>;
    
    // Merge with defaults
    return {
      ...DEFAULT_STATE,
      ...state,
      enabled: state.enabled || [],
      disabled: state.disabled || [],
      linked: state.linked || [],
      permissions: state.permissions || {},
      integrity: state.integrity || {},
      crashes: state.crashes || {},
    };
  } catch {
    // File doesn't exist, return defaults
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save plugin state to .kb/plugins.json
 */
export async function savePluginsState(cwd: string, state: PluginState): Promise<void> {
  const statePath = getPluginsStatePath(cwd);
  const dir = path.dirname(statePath);
  
  await fs.mkdir(dir, { recursive: true });
  
  state.lastUpdated = Date.now();
  
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Check if plugin is enabled
 */
export function isPluginEnabled(state: PluginState, packageName: string, defaultEnabled: boolean = false): boolean {
  if (state.disabled.includes(packageName)) {
    return false;
  }
  if (state.enabled.includes(packageName)) {
    return true;
  }
  return defaultEnabled;
}

/**
 * Enable a plugin
 */
export async function enablePlugin(cwd: string, packageName: string): Promise<void> {
  const state = await loadPluginsState(cwd);
  
  if (!state.enabled.includes(packageName)) {
    state.enabled.push(packageName);
  }
  
  // Remove from disabled if present
  state.disabled = state.disabled.filter(p => p !== packageName);
  
  await savePluginsState(cwd, state);
}

/**
 * Disable a plugin
 */
export async function disablePlugin(cwd: string, packageName: string): Promise<void> {
  const state = await loadPluginsState(cwd);
  
  if (!state.disabled.includes(packageName)) {
    state.disabled.push(packageName);
  }
  
  // Remove from enabled if present
  state.enabled = state.enabled.filter(p => p !== packageName);
  
  await savePluginsState(cwd, state);
}

/**
 * Link a local plugin
 */
export async function linkPlugin(cwd: string, pluginPath: string): Promise<void> {
  const state = await loadPluginsState(cwd);
  const absPath = path.resolve(cwd, pluginPath);
  
  if (!state.linked.includes(absPath)) {
    state.linked.push(absPath);
  }
  
  await savePluginsState(cwd, state);
}

/**
 * Unlink a plugin
 */
export async function unlinkPlugin(cwd: string, pluginPath: string): Promise<void> {
  const state = await loadPluginsState(cwd);
  const absPath = path.resolve(cwd, pluginPath);
  
  state.linked = state.linked.filter(p => p !== absPath);
  
  await savePluginsState(cwd, state);
}

/**
 * Grant permissions to a plugin
 */
export async function grantPermissions(cwd: string, packageName: string, permissions: string[]): Promise<void> {
  const state = await loadPluginsState(cwd);
  
  if (!state.permissions[packageName]) {
    state.permissions[packageName] = [];
  }
  
  for (const perm of permissions) {
    if (!state.permissions[packageName].includes(perm)) {
      state.permissions[packageName].push(perm);
    }
  }
  
  await savePluginsState(cwd, state);
}

/**
 * Record a plugin crash (for quarantine)
 */
export async function recordCrash(cwd: string, packageName: string): Promise<void> {
  const state = await loadPluginsState(cwd);
  
  state.crashes[packageName] = (state.crashes[packageName] || 0) + 1;
  
  // Auto-disable if crashes exceed threshold
  const CRASH_THRESHOLD = 3;
  if (state.crashes[packageName] >= CRASH_THRESHOLD && !state.disabled.includes(packageName)) {
    state.disabled.push(packageName);
  }
  
  await savePluginsState(cwd, state);
}

/**
 * Compute SRI hash for a package
 */
export async function computePackageIntegrity(pkgRoot: string): Promise<string> {
  try {
    const pkgJsonPath = path.join(pkgRoot, 'package.json');
    const content = await fs.readFile(pkgJsonPath, 'utf8');
    const hash = createHash('sha256').update(content).digest('base64');
    return `sha256-${hash}`;
  } catch {
    return '';
  }
}

/**
 * Clear plugin cache
 */
export async function clearCache(cwd: string, options?: { deep?: boolean }): Promise<{ files: string[]; modules?: string[] }> {
  const cleared: string[] = [];

  // 1. Clear .kb/cache/ manifest/plugin files
  const cacheDir = path.join(cwd, '.kb', 'cache');
  try {
    const entries = await fs.readdir(cacheDir);
    for (const entry of entries) {
      if (entry.includes('manifest') || entry.includes('plugin')) {
        const entryPath = path.join(cacheDir, entry);
        await fs.unlink(entryPath);
        cleared.push(entry);
      }
    }
  } catch {
    // Cache dir doesn't exist
  }

  // 2. Clear .kb/marketplace.manifests.json (marketplace manifest cache)
  const manifestsCachePath = path.join(cwd, '.kb', 'marketplace.manifests.json');
  try {
    await fs.unlink(manifestsCachePath);
    cleared.push('marketplace.manifests.json');
  } catch {
    // File doesn't exist
  }

  // 3. Clear .kb/cache/cli-manifests.json (CLI discovery cache)
  const cliManifestsPath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
  try {
    await fs.unlink(cliManifestsPath);
    if (!cleared.includes('cli-manifests.json')) {
      cleared.push('cli-manifests.json');
    }
  } catch {
    // File doesn't exist
  }

  // 4. Reset in-process discovery cache so the next discoverManifests() call in
  //    the same process performs a fresh scan instead of serving stale results.
  resetInProcCache();

  // 5. Deep clearing: clear Node.js module cache for dynamic imports
  const modulesCleared: string[] = [];
  if (options?.deep) {
    try {
      const cache = require.cache;
      for (const key in cache) {
        if (key.includes('plugin') || key.includes('manifest') || key.includes('@kb-labs')) {
          delete cache[key];
          modulesCleared.push(key);
        }
      }
    } catch {
      // Module cache clearing failed (ESM context)
    }
  }

  return {
    files: cleared,
    ...(options?.deep ? { modules: modulesCleared } : {}),
  };
}

