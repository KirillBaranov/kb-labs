/**
 * Metadata collection for package freshness analysis
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively discovers all packages across every `kb-labs-*` sub-repository
 * found directly inside `rootDir`.
 *
 * For each sub-repository directory whose name starts with `kb-labs-`, the
 * function looks for a `packages/` sub-directory and collects the absolute
 * path of every `package.json` found one level deeper. Directories that do
 * not contain a `packages/` folder, or package entries that lack a
 * `package.json`, are silently skipped.
 *
 * @param {string} rootDir - Absolute (or relative) path to the monorepo root
 *   directory whose immediate children are the individual `kb-labs-*` repos.
 * @param {string} [filterPackage] - Optional package directory name to limit
 *   results to a single package. When provided, only the package whose
 *   directory name matches this value exactly is included in the output.
 * @returns {string[]} An array of absolute paths to `package.json` files, one
 *   entry per discovered (and optionally filtered) package.
 *
 * @example
 * // Discover every package in the monorepo
 * const all = findPackages('/workspace');
 *
 * @example
 * // Discover only the 'my-package' package
 * const one = findPackages('/workspace', 'my-package');
 */
export function findPackages(rootDir, filterPackage) {
  const packages = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('kb-labs-')) {continue;}

    const repoPath = path.join(rootDir, entry.name);
    const packagesDir = path.join(repoPath, 'packages');

    if (!fs.existsSync(packagesDir)) {continue;}

    const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const pkgDir of packageDirs) {
      if (!pkgDir.isDirectory()) {continue;}

      // Filter by package name if specified
      if (filterPackage && pkgDir.name !== filterPackage) {continue;}

      const packageJsonPath = path.join(packagesDir, pkgDir.name, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        packages.push(packageJsonPath);
      }
    }
  }

  return packages;
}

/**
 * Get latest modification time in directory (recursive)
 */
function getLatestMtime(dir) {
  if (!fs.existsSync(dir)) {
    return null;
  }

  let latestMtime = 0;

  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        try {
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > latestMtime) {
              latestMtime = stats.mtimeMs;
            }
          }
        } catch (err) {
          // Skip files we can't access
          continue;
        }
      }
    } catch (err) {
      // Skip directories we can't access
      return;
    }
  }

  walk(dir);
  return latestMtime > 0 ? latestMtime : null;
}

/**
 * Collect metadata for a single package
 */
export function collectMetadata(packageJsonPath) {
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  if (!packageJson.name || !packageJson.name.startsWith('@kb-labs/')) {
    return null;
  }

  // Source files metadata
  const srcDir = path.join(packageDir, 'src');
  const srcMtime = getLatestMtime(srcDir);

  // Dist files metadata
  const distDir = path.join(packageDir, 'dist');
  const distExists = fs.existsSync(distDir);
  const distMtime = distExists ? getLatestMtime(distDir) : null;

  // Extract built version from dist/package.json if exists
  const distPackageJsonPath = path.join(distDir, 'package.json');
  let builtVersion = null;

  if (fs.existsSync(distPackageJsonPath)) {
    try {
      const distPackageJson = JSON.parse(fs.readFileSync(distPackageJsonPath, 'utf-8'));
      builtVersion = distPackageJson.version;
    } catch (err) {
      // dist/package.json might not exist or be malformed
      builtVersion = null;
    }
  }

  // Load tsup config to check dts setting
  let hasDts = true; // Default assumption
  const tsupConfigPath = path.join(packageDir, 'tsup.config.ts');

  if (fs.existsSync(tsupConfigPath)) {
    try {
      const tsupContent = fs.readFileSync(tsupConfigPath, 'utf-8');
      // Simple check for dts: false
      if (tsupContent.includes('dts: false') || tsupContent.includes('dts:false')) {
        hasDts = false;
      }
    } catch (err) {
      // Can't read tsup config, assume dts enabled
    }
  }

  return {
    name: packageJson.name,
    version: packageJson.version || '0.0.0',
    dir: packageDir,
    srcMtime,
    distMtime,
    distExists,
    builtVersion,
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
    hasDts,
  };
}

/**
 * Collect metadata for all packages
 */
export async function collectAllMetadata(packages) {
  const metadata = new Map();

  for (const packagePath of packages) {
    const meta = collectMetadata(packagePath);
    if (meta) {
      metadata.set(meta.name, meta);
    }
  }

  return metadata;
}
