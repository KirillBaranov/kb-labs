/**
 * Shared package discovery for KB Labs workspace.
 *
 * Supports both flat and categorized workspace layouts.
 * All devkit tools should import this instead of inlining their own findPackages.
 */

import fs from 'fs';
import path from 'path';

const CATEGORIES = ['platform', 'plugins', 'infra', 'templates', 'installer', 'sites'];

/**
 * Find all KB Labs packages in the workspace.
 *
 * Scans for kb-labs-* directories in:
 * Scans root level (flat: kb-labs-*) and category level (platform/kb-labs-*, plugins/kb-labs-*, etc.).
 * Also scans apps/ directories for app-style packages.
 *
 * @param {string} rootDir - Workspace root directory
 * @param {string} [filterPackage] - Optional package name filter (e.g., 'core-cli')
 * @returns {string[]} Array of package.json file paths
 */
export function findPackages(rootDir, filterPackage) {
  const packages = [];

  // Collect all repo directories (both flat and categorized)
  const repoDirs = [];

  const rootEntries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith('kb-labs-')) {
      // Flat layout: kb-labs-* at root
      repoDirs.push(path.join(rootDir, entry.name));
    } else if (CATEGORIES.includes(entry.name)) {
      // Categorized layout: platform/kb-labs-*, plugins/kb-labs-*, etc.
      const categoryPath = path.join(rootDir, entry.name);
      try {
        const categoryEntries = fs.readdirSync(categoryPath, { withFileTypes: true });
        for (const catEntry of categoryEntries) {
          if (catEntry.isDirectory() && catEntry.name.startsWith('kb-labs-')) {
            repoDirs.push(path.join(categoryPath, catEntry.name));
          }
        }
      } catch {
        // Category dir not readable, skip
      }
    }
  }

  // Scan each repo for packages/ and apps/ subdirectories
  for (const repoPath of repoDirs) {
    for (const subdir of ['packages', 'apps']) {
      const pkgsDir = path.join(repoPath, subdir);
      if (!fs.existsSync(pkgsDir)) continue;

      try {
        const pkgDirs = fs.readdirSync(pkgsDir, { withFileTypes: true });
        for (const pkgDir of pkgDirs) {
          if (!pkgDir.isDirectory()) continue;
          if (filterPackage && pkgDir.name !== filterPackage) continue;

          const packageJsonPath = path.join(pkgsDir, pkgDir.name, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            packages.push(packageJsonPath);
          }
        }
      } catch {
        // Dir not readable, skip
      }
    }
  }

  return packages;
}
