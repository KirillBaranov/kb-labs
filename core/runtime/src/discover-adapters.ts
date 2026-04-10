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
  createAdapter: (config?: any) => any;
  /** Adapter module (full exports) */
  module: any;
}

/**
 * Load adapter module by file path (ESM import)
 */
async function loadAdapterModule(distPath: string): Promise<any> {
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

    // Read main export path from package.json
    let mainPath = 'dist/index.js';
    try {
      const pkgContent = await fs.readFile(path.join(pkgRoot, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);
      mainPath = pkg.main || mainPath;
    } catch { /* use default */ }

    const distPath = path.join(pkgRoot, mainPath);

    try {
      await fs.access(distPath);
      const module = await loadAdapterModule(distPath);

      if (typeof module.createAdapter !== 'function') {
        continue;
      }

      discovered.set(pkgId, {
        packageName: pkgId,
        pkgRoot,
        createAdapter: module.createAdapter,
        module,
      });
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
): Promise<((config?: any) => any) | null> {
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
      if (typeof module.createAdapter === 'function') {return module.createAdapter;}
      if (typeof module.default === 'function') {return module.default;}
    } catch { /* subpath not found */ }
  } else if (adapter) {
    return adapter.createAdapter;
  }

  // No fallback — all adapters must be registered in marketplace.lock
  return null;
}
