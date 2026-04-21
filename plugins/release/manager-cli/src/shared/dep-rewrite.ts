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

    for (const depName of Object.keys(deps)) {
      const val = deps[depName];
      if (typeof val !== 'string') { continue; }

      if (val.startsWith('link:')) {
        // link: is always invalid on npm registry — replace with semver range
        const pinned = versionMap.get(depName);
        if (pinned) {
          deps[depName] = `^${pinned}`;
        } else {
          try {
            const linkPath = val.slice('link:'.length);
            const linked = JSON.parse(readFileSync(join(pkgPath, linkPath, 'package.json'), 'utf-8')) as { version?: string };
            deps[depName] = `^${linked.version ?? '*'}`;
          } catch {
            deps[depName] = '*';
          }
        }
        modified = true;
      } else if (val.startsWith('workspace:') && packageManager !== 'pnpm') {
        // pnpm publish rewrites workspace: natively; npm/yarn need manual replacement
        const pinned = versionMap.get(depName);
        if (pinned) {
          deps[depName] = val === 'workspace:*' ? `^${pinned}` : val.replace('workspace:', '');
          modified = true;
        }
      }
    }
  }

  if (modified) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
  }

  return () => writeFileSync(pkgJsonPath, original);
}

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

export function topoSort(packages: TopoPackage[], packageManager: string): TopoPackage[][] {
  const nameSet = new Set(packages.map(p => p.name));

  // Build adjacency: pkg → set of deps that are also being released
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

  // Kahn's algorithm
  const inDegree = new Map<string, number>(packages.map(p => [p.name, 0]));
  for (const [, d] of deps) {
    for (const dep of d) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  // Actually we want packages whose deps are resolved first.
  // Recompute: inDegree[pkg] = number of its dependencies (incoming edges from deps).
  // A package is "ready" when all its dependencies have been placed in earlier waves.
  const dependants = new Map<string, Set<string>>(); // dep → packages that depend on it
  for (const pkg of packages) {
    for (const dep of deps.get(pkg.name) ?? []) {
      if (!dependants.has(dep)) { dependants.set(dep, new Set()); }
      dependants.get(dep)!.add(pkg.name);
    }
  }

  const remaining = new Map<string, number>(
    packages.map(p => [p.name, (deps.get(p.name) ?? new Set()).size])
  );

  const byName = new Map(packages.map(p => [p.name, p]));
  const waves: TopoPackage[][] = [];

  while (remaining.size > 0) {
    const wave = [...remaining.entries()]
      .filter(([, count]) => count === 0)
      .map(([name]) => byName.get(name)!);

    if (wave.length === 0) {
      // Cycle detected — dump remainder as a final wave
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
