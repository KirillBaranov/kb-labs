/**
 * Rewrite workspace:/link: dependency references to pinned npm versions.
 *
 * - pnpm handles `workspace:*` natively during `pnpm publish` — no rewrite needed.
 * - npm/yarn do NOT — we must replace with `^version` before publish.
 * - `link:` references are never valid on the npm registry — always rewrite.
 *
 * Returns a restore function that reverts package.json to original content.
 * Call it in a finally block to guarantee cleanup.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── rewriteWorkspaceDeps helpers ──────────────────────────────────────────

function rewriteLinkDep(
  deps: Record<string, string>,
  depName: string,
  val: string,
  pkgPath: string,
  versionMap: Map<string, string>,
): void {
  const pinned = versionMap.get(depName);
  if (pinned) {
    deps[depName] = `^${pinned}`;
    return;
  }
  try {
    const linkPath = val.slice('link:'.length);
    const linked = JSON.parse(readFileSync(join(pkgPath, linkPath, 'package.json'), 'utf-8')) as { version?: string };
    deps[depName] = `^${linked.version ?? '*'}`;
  } catch {
    deps[depName] = '*';
  }
}

function rewriteWorkspaceDep(
  deps: Record<string, string>,
  depName: string,
  val: string,
  versionMap: Map<string, string>,
): boolean {
  const pinned = versionMap.get(depName);
  if (!pinned) { return false; }
  deps[depName] = val === 'workspace:*' ? `^${pinned}` : val.replace('workspace:', '');
  return true;
}

function rewriteDepsSection(
  deps: Record<string, string>,
  pkgPath: string,
  versionMap: Map<string, string>,
  packageManager: string,
): boolean {
  let modified = false;
  for (const depName of Object.keys(deps)) {
    const val = deps[depName];
    if (typeof val !== 'string') { continue; }
    if (val.startsWith('link:')) {
      rewriteLinkDep(deps, depName, val, pkgPath, versionMap);
      modified = true;
    } else if (val.startsWith('workspace:') && packageManager !== 'pnpm') {
      if (rewriteWorkspaceDep(deps, depName, val, versionMap)) { modified = true; }
    }
  }
  return modified;
}

export function rewriteWorkspaceDeps(
  pkgPath: string,
  versionMap: Map<string, string>,
  packageManager: string,
): () => void {
  const pkgJsonPath = join(pkgPath, 'package.json');
  const original = readFileSync(pkgJsonPath, 'utf-8');
  const pkgJson = JSON.parse(original) as Record<string, unknown>;
  let modified = false;

  for (const section of ['dependencies', 'peerDependencies'] as const) {
    const deps = pkgJson[section] as Record<string, string> | undefined;
    if (!deps) { continue; }
    if (rewriteDepsSection(deps, pkgPath, versionMap, packageManager)) { modified = true; }
  }

  if (modified) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
  }

  return () => writeFileSync(pkgJsonPath, original);
}

// ── topoSort helpers ──────────────────────────────────────────────────────

/**
 * Build a simple topological sort of packages for publish order.
 *
 * Packages are grouped into "waves": wave 0 has no intra-release deps,
 * wave 1 depends only on wave 0, etc. Within each wave publish order
 * is arbitrary (safe to parallelise).
 *
 * Cycles (should not exist in a well-formed monorepo) fall into a
 * "remainder" group appended at the end.
 */
export interface TopoPackage {
  name: string;
  path: string;
  version: string;
}

function buildIntraDeps(packages: TopoPackage[], nameSet: Set<string>): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const pkg of packages) {
    const intra = new Set<string>();
    try {
      const pkgJson = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const section of ['dependencies', 'peerDependencies'] as const) {
        for (const depName of Object.keys(pkgJson[section] ?? {})) {
          if (nameSet.has(depName)) { intra.add(depName); }
        }
      }
    } catch {
      // If we can't read package.json, treat as no deps
    }
    deps.set(pkg.name, intra);
  }
  return deps;
}

function buildDependantsMap(packages: TopoPackage[], deps: Map<string, Set<string>>): Map<string, Set<string>> {
  const dependants = new Map<string, Set<string>>();
  for (const pkg of packages) {
    for (const dep of deps.get(pkg.name) ?? []) {
      if (!dependants.has(dep)) { dependants.set(dep, new Set()); }
      dependants.get(dep)!.add(pkg.name);
    }
  }
  return dependants;
}

function computeWaves(
  packages: TopoPackage[],
  deps: Map<string, Set<string>>,
  dependants: Map<string, Set<string>>,
): TopoPackage[][] {
  const byName = new Map(packages.map(p => [p.name, p]));
  const remaining = new Map<string, number>(
    packages.map(p => [p.name, (deps.get(p.name) ?? new Set()).size])
  );
  const waves: TopoPackage[][] = [];

  while (remaining.size > 0) {
    const wave = [...remaining.entries()]
      .filter(([, count]) => count === 0)
      .map(([name]) => byName.get(name)!);

    if (wave.length === 0) {
      waves.push([...remaining.keys()].map(n => byName.get(n)!));
      break;
    }

    waves.push(wave);
    for (const pkg of wave) {
      remaining.delete(pkg.name);
      for (const dependant of dependants.get(pkg.name) ?? []) {
        if (remaining.has(dependant)) {
          remaining.set(dependant, (remaining.get(dependant) ?? 1) - 1);
        }
      }
    }
  }

  return waves.filter(w => w.length > 0);
}

export function topoSort(packages: TopoPackage[], _packageManager: string): TopoPackage[][] {
  const nameSet = new Set(packages.map(p => p.name));
  const deps = buildIntraDeps(packages, nameSet);
  const dependants = buildDependantsMap(packages, deps);
  return computeWaves(packages, deps, dependants);
}
