/**
 * @module @kb-labs/core-runtime/discover-adapters
 * Lock-based adapter discovery — reads from .kb/marketplace.lock.
 *
 * All adapters must be registered via `kb marketplace link` or `kb marketplace install`.
 * No filesystem scanning.
 */

import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  readMarketplaceLock,
  DiagnosticCollector,
} from '@kb-labs/core-discovery';

/**
 * Discovered adapter info
 */
export interface DiscoveredAdapter {
  /** Package name (e.g., "@kb-labs/adapters-openai") */
  packageName: string;
  /** Absolute path to package root */
  pkgRoot: string;
  /** Adapter factory function */
  createAdapter: (config?: unknown) => unknown;
  /** Adapter module (full exports) */
  module: Record<string, unknown>;
}

/**
 * Load adapter module by file path (ESM import)
 */
async function loadAdapterModule(distPath: string): Promise<Record<string, unknown>> {
  const fileUrl = pathToFileURL(distPath).href;
  return import(fileUrl);
}

/**
 * Discover adapters from marketplace.lock.
 * Reads entries with `primaryKind === 'adapter'` and loads their modules.
 *
 * @param cwd - Workspace root directory
 * @returns Map of package names to adapter info
 */
export async function discoverAdapters(cwd: string): Promise<Map<string, DiscoveredAdapter>> {
  const discovered = new Map<string, DiscoveredAdapter>();
  const diag = new DiagnosticCollector();
  const lock = await readMarketplaceLock(cwd, diag);

  if (!lock) {
    return discovered;
  }

  for (const [pkgId, entry] of Object.entries(lock.installed)) {
    if (entry.primaryKind !== 'adapter') {continue;}
    if (entry.enabled === false) {continue;}

    const pkgRoot = path.resolve(cwd, entry.resolvedPath);

    // Read main export path and npm package name from package.json.
    // The npm package name may differ from pkgId (manifest ID) — e.g. lock key
    // is "kblabs-gateway-llm" but npm package is "@kb-labs/adapters-kblabs-gateway".
    let mainPath = 'dist/index.js';
    let npmPkgName: string | undefined;
    try {
      const pkgContent = await fs.readFile(path.join(pkgRoot, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent) as { main?: string; name?: string };
      mainPath = pkg.main || mainPath;
      npmPkgName = pkg.name;
    } catch { /* use defaults */ }

    const distPath = path.join(pkgRoot, mainPath);

    try {
      await fs.access(distPath);
      const module = await loadAdapterModule(distPath);

      if (typeof module.createAdapter !== 'function') {
        continue;
      }

      const adapterEntry: DiscoveredAdapter = {
        packageName: npmPkgName ?? pkgId,
        pkgRoot,
        createAdapter: module.createAdapter as (config?: unknown) => unknown,
        module,
      };

      // Index by manifest ID (primary key in marketplace.lock)
      discovered.set(pkgId, adapterEntry);
      // Also index by npm package name so config values like "@kb-labs/adapters-kblabs-gateway"
      // resolve correctly even when the lock key is a manifest ID like "kblabs-gateway-llm".
      if (npmPkgName && npmPkgName !== pkgId) {
        discovered.set(npmPkgName, adapterEntry);
      }
    } catch {
      // Skip adapters that fail to load (not built yet)
    }
  }

  return discovered;
}

/**
 * Resolve adapter path — reads from marketplace.lock, supports subpath exports.
 *
 * @param adapterPath - Package name or subpath (e.g., "@kb-labs/adapters-openai/embeddings")
 * @param cwd - Workspace root directory
 * @returns Adapter factory function
 */
export async function resolveAdapter(
  adapterPath: string,
  cwd: string,
): Promise<((config?: unknown) => unknown) | null> {
  const discovered = await discoverAdapters(cwd);

  // Check for subpath exports (e.g., "@kb-labs/adapters-openai/embeddings")
  const basePkgName = adapterPath.split('/').slice(0, 2).join('/');
  const subpath = adapterPath.includes('/')
    ? adapterPath.split('/').slice(2).join('/')
    : null;

  const adapter = discovered.get(basePkgName);

  if (adapter && subpath) {
    const subpathFile = path.join(adapter.pkgRoot, 'dist', `${subpath}.js`);
    try {
      await fs.access(subpathFile);
      const module = await loadAdapterModule(subpathFile);
      if (typeof module.createAdapter === 'function') {return module.createAdapter as (config?: unknown) => unknown;}
      if (typeof module.default === 'function') {return module.default as (config?: unknown) => unknown;}
    } catch { /* subpath not found */ }
  } else if (adapter) {
    return adapter.createAdapter;
  }

  // No fallback — all adapters must be registered in marketplace.lock
  return null;
}
