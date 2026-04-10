/**
 * Topological sort for workspace packages (Kahn's algorithm).
 * Computes build layers from package.json dependencies.
 * No external dependencies — standalone implementation.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspacePackage } from '@kb-labs/qa-contracts';

export interface BuildLayer {
  index: number;
  packages: WorkspacePackage[];
}

/**
 * Read workspace-internal dependencies from a package.json.
 * Returns only dependency names that exist in the workspace package set.
 */
function readWorkspaceDeps(pkgDir: string, workspaceNames: Set<string>): string[] {
  try {
    const raw = readFileSync(join(pkgDir, 'package.json'), 'utf-8');
    const pkgJson = JSON.parse(raw);
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    return Object.keys(allDeps).filter(dep => workspaceNames.has(dep));
  } catch {
    return [];
  }
}

/**
 * Compute build layers via topological sort (Kahn's algorithm).
 *
 * Layer 0 = packages with no workspace dependencies (can build first).
 * Layer N = packages whose deps are all in layers 0..N-1.
 *
 * Circular dependencies are appended as the last layer with a warning.
 */
interface DepGraph {
  nameMap: Map<string, WorkspacePackage>;
  inDegree: Map<string, number>;
  dependents: Map<string, string[]>;
}

function buildDepGraph(packages: WorkspacePackage[]): DepGraph {
  const nameMap = new Map<string, WorkspacePackage>();
  const workspaceNames = new Set<string>();
  for (const pkg of packages) {
    nameMap.set(pkg.name, pkg);
    workspaceNames.add(pkg.name);
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const pkg of packages) {
    inDegree.set(pkg.name, 0);
    dependents.set(pkg.name, []);
  }
  for (const pkg of packages) {
    const deps = readWorkspaceDeps(pkg.dir, workspaceNames);
    inDegree.set(pkg.name, deps.length);
    for (const dep of deps) {
      dependents.get(dep)!.push(pkg.name);
    }
  }
  return { nameMap, inDegree, dependents };
}

export function computeBuildLayers(packages: WorkspacePackage[]): BuildLayer[] {
  if (packages.length === 0) { return []; }

  const { nameMap, inDegree, dependents } = buildDepGraph(packages);
  const layers: BuildLayer[] = [];
  const remaining = new Set(packages.map(p => p.name));

  while (remaining.size > 0) {
    const layerNames: string[] = [];
    for (const name of remaining) {
      if ((inDegree.get(name) ?? 0) === 0) { layerNames.push(name); }
    }

    if (layerNames.length === 0) {
      const circular = [...remaining].map(n => nameMap.get(n)!).filter(Boolean);
      layers.push({ index: layers.length, packages: circular });
      break;
    }

    layerNames.sort();
    layers.push({ index: layers.length, packages: layerNames.map(n => nameMap.get(n)!) });

    for (const name of layerNames) {
      remaining.delete(name);
      for (const dependent of (dependents.get(name) ?? [])) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
      }
    }
  }

  return layers;
}

/**
 * Sort packages in dependency order (topological sort).
 * Packages with no deps come first, dependents come after their deps.
 */
export function sortByBuildLayers(packages: WorkspacePackage[]): WorkspacePackage[] {
  return computeBuildLayers(packages).flatMap(l => l.packages);
}
