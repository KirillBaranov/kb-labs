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
    } else if (val.startsWith('workspace:') && packageManager !== 'pnpm' && rewriteWorkspaceDep(deps, depName, val, versionMap)) {
      modified = true;
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
