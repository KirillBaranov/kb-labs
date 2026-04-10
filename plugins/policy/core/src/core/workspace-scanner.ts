import fs from 'node:fs';
import path from 'node:path';
import type { PolicyConfig } from '@kb-labs/policy-contracts';
import { detectCategory } from './category-resolver.js';

interface PackageInfo {
  name: string;
  repoPath: string;
  category: string | null;
  packageJsonPath: string;
}

/**
 * Scans all packages in the workspace and returns a map of packageName → category.
 * Also returns full PackageInfo for more detailed lookups.
 */
export function buildPackageMap(
  workspaceRoot: string,
  config: PolicyConfig,
): Map<string, string | null> {
  const packages = scanAllPackages(workspaceRoot, config);
  const map = new Map<string, string | null>();
  for (const pkg of packages) {
    map.set(pkg.name, pkg.category);
  }
  return map;
}

/**
 * Returns all packages in a specific repo (by repo path relative to workspaceRoot).
 */
export function getRepoPackageNames(workspaceRoot: string, repoPath: string): string[] {
  const absRepoPath = path.resolve(workspaceRoot, repoPath);
  const names: string[] = [];

  for (const subdir of ['packages', 'apps']) {
    const subdirPath = path.join(absRepoPath, subdir);
    if (!fs.existsSync(subdirPath)) {continue;}

    for (const entry of fs.readdirSync(subdirPath)) {
      const pkgJsonPath = path.join(subdirPath, entry, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) {continue;}
      try {
        const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (json.name) {names.push(json.name);}
      } catch {
        // ignore invalid package.json
      }
    }
  }

  return names;
}

function scanAllPackages(workspaceRoot: string, config: PolicyConfig): PackageInfo[] {
  const results: PackageInfo[] = [];
  const topLevelDirs = ['platform', 'plugins', 'infra', 'templates', 'installer', 'sites'];

  for (const topDir of topLevelDirs) {
    const topDirPath = path.join(workspaceRoot, topDir);
    if (!fs.existsSync(topDirPath)) {continue;}

    for (const repoEntry of fs.readdirSync(topDirPath)) {
      const repoPath = path.join(topDirPath, repoEntry);
      const repoRelPath = `${topDir}/${repoEntry}`;

      // FIX 4 (MEDIUM): statSync can throw on broken symlinks, permission errors,
      // or race conditions where an entry disappears between readdirSync and statSync.
      // Skip the entry rather than letting the error propagate and abort the scan.
      let isDir: boolean;
      try {
        isDir = fs.statSync(repoPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) {continue;}

      const categoryResult = detectCategory(repoRelPath, config);

      for (const subdir of ['packages', 'apps']) {
        const subdirPath = path.join(repoPath, subdir);
        if (!fs.existsSync(subdirPath)) {continue;}

        for (const pkgEntry of fs.readdirSync(subdirPath)) {
          const pkgJsonPath = path.join(subdirPath, pkgEntry, 'package.json');
          if (!fs.existsSync(pkgJsonPath)) {continue;}

          try {
            const json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            if (json.name) {
              results.push({
                name: json.name,
                repoPath: repoRelPath,
                category: categoryResult.category,
                packageJsonPath: pkgJsonPath,
              });
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return results;
}
