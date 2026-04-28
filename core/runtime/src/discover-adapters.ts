/**
 * @module @kb-labs/core-runtime/discover-adapters
 * Lock-based adapter discovery — reads from .kb/marketplace.lock.
 *
 * All adapters must be registered via `kb marketplace link` or `kb marketplace install`.
 * No filesystem scanning.
 *
 * Priority: projectRoot lock is loaded first (project wins). platformRoot lock
 * fills in any gaps. This ensures that when platform.dir is set, workspace
 * adapters override the installed platform's adapters.
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
 * Load adapters from a single marketplace.lock file into the discovered map.
 *
 * @param root - Directory containing .kb/marketplace.lock
 * @param discovered - Map to populate
 * @param overwrite - If false, skip entries already present in the map (used for platform fallback)
 */
async function loadAdaptersFromLock(
  root: string,
  discovered: Map<string, DiscoveredAdapter>,
  overwrite: boolean,
): Promise<void> {
  const diag = new DiagnosticCollector();
  const lock = await readMarketplaceLock(root, diag);
  if (!lock) { return; }

  for (const [pkgId, entry] of Object.entries(lock.installed)) {
    if (entry.primaryKind !== 'adapter') { continue; }
    if (entry.enabled === false) { continue; }

    const pkgRoot = path.resolve(root, entry.resolvedPath);

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

      // Index by manifest ID and npm package name.
      // When overwrite=false (platform fallback), skip entries already set by project.
      if (overwrite || !discovered.has(pkgId)) {
        discovered.set(pkgId, adapterEntry);
      }
      if (npmPkgName && npmPkgName !== pkgId) {
        if (overwrite || !discovered.has(npmPkgName)) {
          discovered.set(npmPkgName, adapterEntry);
        }
      }
    } catch {
      // Skip adapters that fail to load (not built yet)
    }
  }
}

/**
 * Discover adapters from marketplace.lock(s).
 * Reads entries with `primaryKind === 'adapter'` and loads their modules.
 *
 * When projectRoot is provided and differs from platformRoot, the project lock
 * is read first (project wins). The platform lock fills any remaining gaps.
 *
 * @param platformRoot - Platform installation / workspace root directory
 * @param projectRoot  - Project root (overrides platformRoot entries when different)
 * @returns Map of package names to adapter info
 */
export async function discoverAdapters(
  platformRoot: string,
  projectRoot?: string,
): Promise<Map<string, DiscoveredAdapter>> {
  const discovered = new Map<string, DiscoveredAdapter>();

  // Project lock first — project wins
  if (projectRoot && projectRoot !== platformRoot) {
    await loadAdaptersFromLock(projectRoot, discovered, /* overwrite= */ true);
  }

  // Platform lock second — fills gaps only
  await loadAdaptersFromLock(platformRoot, discovered, /* overwrite= */ false);

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
