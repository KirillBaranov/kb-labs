/**
 * @kb-labs/cli-commands/registry
 * Plugin state management - read/write .kb/plugins.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

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


