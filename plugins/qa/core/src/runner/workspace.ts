import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { WorkspacePackage, PackageFilter, SubmoduleInfo } from '@kb-labs/qa-contracts';
import type { PackagesConfig } from '@kb-labs/qa-contracts';
import { getSubmoduleInfo } from './submodule-info.js';

function hasWorkspace(dir: string): boolean {
  return existsSync(join(dir, 'pnpm-workspace.yaml'));
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function buildCandidatesFromConfig(rootDir: string, paths: string[]): string[] {
  const candidates: string[] = [];
  for (const pattern of paths) {
    const parts = pattern.split('/');
    if (parts.length === 2 && parts[1] === '*' && parts[0]) {
      const categoryDir = join(rootDir, parts[0]);
      if (!isDir(categoryDir)) { continue; }
      try {
        for (const sub of readdirSync(categoryDir)) {
          if (sub.startsWith('.') || sub === 'node_modules') { continue; }
          const subPath = join(categoryDir, sub);
          if (isDir(subPath) && hasWorkspace(subPath)) { candidates.push(subPath); }
        }
      } catch { /* skip unreadable dirs */ }
    } else {
      const exactPath = join(rootDir, pattern);
      if (isDir(exactPath) && hasWorkspace(exactPath)) { candidates.push(exactPath); }
    }
  }
  return candidates;
}

function buildCandidatesAutoScan(rootDir: string): string[] {
  const candidates: string[] = [];
  for (const entry of readdirSync(rootDir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') { continue; }
    const entryPath = join(rootDir, entry);
    if (!isDir(entryPath)) { continue; }
    if (hasWorkspace(entryPath)) {
      candidates.push(entryPath);
    } else {
      try {
        for (const sub of readdirSync(entryPath)) {
          if (sub.startsWith('.') || sub === 'node_modules') { continue; }
          const subPath = join(entryPath, sub);
          if (isDir(subPath) && hasWorkspace(subPath)) { candidates.push(subPath); }
        }
      } catch { /* skip unreadable dirs */ }
    }
  }
  return candidates;
}

function scanSubDir(
  parentDir: string,
  entryPath: string,
  repoName: string,
  rootDir: string,
  submodule: SubmoduleInfo | undefined,
  packages: WorkspacePackage[],
): void {
  if (!isDir(parentDir)) { return; }
  for (const pkgDir of readdirSync(parentDir)) {
    const pkgPath = join(parentDir, pkgDir);
    const pkgJsonPath = join(pkgPath, 'package.json');
    if (!existsSync(pkgJsonPath)) { continue; }
    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      packages.push({
        name: pkgJson.name || pkgDir,
        dir: pkgPath,
        relativePath: relative(rootDir, pkgPath),
        repo: repoName,
        submodule,
      });
    } catch { /* skip invalid package.json */ }
  }
}

/**
 * Discover all workspace packages in the monorepo.
 *
 * If packagesConfig.paths is set, use those glob-expanded paths to find sub-monorepos.
 * Otherwise fall back to auto-scan (supports both flat and nested layouts).
 */
export function getWorkspacePackages(
  rootDir: string,
  filter?: PackageFilter,
  packagesConfig?: PackagesConfig,
): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  const submoduleCache = new Map<string, SubmoduleInfo | null>();

  function getSubmoduleCached(entryPath: string, repoName: string): SubmoduleInfo | undefined {
    if (!submoduleCache.has(repoName)) {
      submoduleCache.set(repoName, getSubmoduleInfo(entryPath, repoName));
    }
    return submoduleCache.get(repoName) ?? undefined;
  }

  const candidates =
    packagesConfig?.paths && packagesConfig.paths.length > 0
      ? buildCandidatesFromConfig(rootDir, packagesConfig.paths)
      : buildCandidatesAutoScan(rootDir);

  for (const entryPath of candidates) {
    const repoName = relative(rootDir, entryPath);
    const submodule = getSubmoduleCached(entryPath, repoName);
    scanSubDir(join(entryPath, 'packages'), entryPath, repoName, rootDir, submodule, packages);
    scanSubDir(join(entryPath, 'apps'), entryPath, repoName, rootDir, submodule, packages);
  }

  let filtered = packages;
  if (packagesConfig?.include && packagesConfig.include.length > 0) {
    filtered = filtered.filter(pkg =>
      packagesConfig.include!.some(pattern => matchesPattern(pkg.name, pkg.repo, pattern))
    );
  }
  if (packagesConfig?.exclude && packagesConfig.exclude.length > 0) {
    filtered = filtered.filter(pkg =>
      !packagesConfig.exclude!.some(pattern => matchesPattern(pkg.name, pkg.repo, pattern))
    );
  }

  if (!filter) { return filtered; }

  return filtered.filter((pkg) => {
    if (filter.package && !pkg.name.includes(filter.package)) { return false; }
    if (filter.repo && pkg.repo !== filter.repo) { return false; }
    if (filter.scope) {
      const scope = filter.scope.startsWith('@') ? filter.scope : `@${filter.scope}`;
      if (!pkg.name.startsWith(scope)) { return false; }
    }
    return true;
  });
}

/**
 * Match a package against a pattern.
 * Supports: exact name, "@kb-labs/core-*" glob, "kb-labs-cli/*" repo prefix.
 */
function matchesPattern(name: string, repo: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return repo === prefix || repo.startsWith(prefix + '/');
  }
  if (pattern.endsWith('*')) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return name === pattern || repo === pattern;
}
