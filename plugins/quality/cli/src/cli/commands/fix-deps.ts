/**
 * quality:fix-deps - Dependency auto-fixer
 *
 * Automatically fixes dependency issues:
 * - Remove unused dependencies
 * - Add missing workspace dependencies
 * - Align duplicate dependency versions
 *
 * Supports --dry-run for previewing changes without applying
 */

import { defineCommand, type PluginContextV3, useLoader } from '@kb-labs/sdk';
import type { FixDepsFlags } from './flags.js';
import fs from 'node:fs';
import path from 'node:path';

// Input type with backward compatibility
type FixDepsInput = FixDepsFlags & { argv?: string[] };

interface FixResult {
  packagesScanned: number;
  removedDeps: Array<{ package: string; dep: string }>;
  addedDeps: Array<{ package: string; dep: string; version: string }>;
  alignedDeps: Array<{ dep: string; from: string; to: string; packages: string[] }>;
  dryRun: boolean;
}

type FixDepsCommandResult = {
  exitCode: number;
  result?: FixResult;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:fix-deps',
  description: 'Auto-fix dependency issues',

  handler: {
    async execute(ctx: PluginContextV3, input: FixDepsInput): Promise<FixDepsCommandResult> {
      const { ui, platform } = ctx;

      // V3: Flags come in input.flags object (not auto-merged)
      const flags = (input as any).flags ?? input;

      const dryRun = flags['dry-run'] ?? false;
      const removeUnused = flags['remove-unused'] || flags.all;
      const addMissing = flags['add-missing'] || flags.all;
      const alignVersions = flags['align-versions'] || flags.all;
      const showStats = flags.stats;

      // If stats requested, show dependency statistics
      if (showStats) {
        const stats = await getDependencyStats(ctx.cwd);
        outputStats(stats, flags, ui);
        return { exitCode: 0 };
      }

      // If no fix flags specified, show error
      if (!removeUnused && !addMissing && !alignVersions) {
        ui?.error?.('No fix options specified. Use --remove-unused, --add-missing, --align-versions, or --all');
        return { exitCode: 1 };
      }

      const loader = useLoader('Scanning packages...');
      loader.start();

      const result: FixResult = {
        packagesScanned: 0,
        removedDeps: [],
        addedDeps: [],
        alignedDeps: [],
        dryRun,
      };

      const packages = findPackages(ctx.cwd);
      result.packagesScanned = packages.length;

      loader.update({ text: `Scanned ${packages.length} packages` });

      // 1. Align versions first (if requested)
      if (alignVersions) {
        loader.update({ text: 'Analyzing duplicate dependencies...' });
        const aligned = await alignDuplicateVersions(packages, dryRun);
        result.alignedDeps = aligned;
      }

      // 2. Add missing workspace dependencies
      if (addMissing) {
        loader.update({ text: 'Checking for missing workspace dependencies...' });
        const added = await addMissingWorkspaceDeps(packages, dryRun);
        result.addedDeps = added;
      }

      // 3. Remove unused dependencies
      if (removeUnused) {
        loader.update({ text: 'Checking for unused dependencies...' });
        const removed = await removeUnusedDeps(packages, dryRun);
        result.removedDeps = removed;
      }

      loader.succeed('Dependency analysis completed');

      // Track analytics
      await platform.analytics.track('quality:fix-deps', {
        dryRun,
        packagesScanned: result.packagesScanned,
        removedCount: result.removedDeps.length,
        addedCount: result.addedDeps.length,
        alignedCount: result.alignedDeps.length,
      });

      // Output results
      outputResults(result, flags, ui);

      return {
        exitCode: 0,
        result,
      };
    },
  },
});

/**
 * Find all packages in the monorepo
 */
function findPackages(rootDir: string): Array<{ name: string; path: string; json: any }> {
  const packages: Array<{ name: string; path: string; json: any }> = [];

  if (!fs.existsSync(rootDir)) {
    return packages;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('kb-labs-')) {continue;}

    const repoPath = path.join(rootDir, entry.name);
    const packagesDir = path.join(repoPath, 'packages');

    if (!fs.existsSync(packagesDir)) {continue;}

    const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const pkgDir of packageDirs) {
      if (!pkgDir.isDirectory()) {continue;}

      const packageJsonPath = path.join(packagesDir, pkgDir.name, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        packages.push({
          name: packageJson.name || pkgDir.name,
          path: packageJsonPath,
          json: packageJson,
        });
      }
    }
  }

  return packages;
}

/**
 * Get dependency statistics
 */
async function getDependencyStats(rootDir: string): Promise<any> {
  const packages = findPackages(rootDir);
  const allDeps = new Map<string, Set<string>>();

  for (const pkg of packages) {
    const deps = {
      ...pkg.json.dependencies,
      ...pkg.json.devDependencies,
    };

    for (const [dep, version] of Object.entries(deps)) {
      if (!allDeps.has(dep)) {
        allDeps.set(dep, new Set());
      }
      allDeps.get(dep)!.add(version as string);
    }
  }

  const duplicates = Array.from(allDeps.entries())
    .filter(([_, versions]) => versions.size > 1)
    .filter(([dep]) => !dep.startsWith('@kb-labs/'));

  const topUsed = Array.from(allDeps.entries())
    .map(([name, versions]) => ({ name, count: versions.size > 1 ? versions.size : 1 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalPackages: packages.length,
    totalDeps: allDeps.size,
    duplicates: duplicates.length,
    topUsed,
  };
}

/**
 * Align duplicate dependency versions to most common version
 */
async function alignDuplicateVersions(
  packages: Array<{ name: string; path: string; json: any }>,
  dryRun: boolean
): Promise<Array<{ dep: string; from: string; to: string; packages: string[] }>> {
  const aligned: Array<{ dep: string; from: string; to: string; packages: string[] }> = [];

  // Find all dependencies and their versions
  const depVersions = new Map<string, Map<string, Set<string>>>();

  for (const pkg of packages) {
    const deps = {
      ...pkg.json.dependencies,
      ...pkg.json.devDependencies,
    };

    for (const [dep, version] of Object.entries(deps)) {
      if (dep.startsWith('@kb-labs/')) {continue;} // Skip workspace deps

      if (!depVersions.has(dep)) {
        depVersions.set(dep, new Map());
      }

      const versions = depVersions.get(dep)!;
      if (!versions.has(version as string)) {
        versions.set(version as string, new Set());
      }
      versions.get(version as string)!.add(pkg.name);
    }
  }

  // Find duplicates and determine most common version
  for (const [dep, versions] of depVersions.entries()) {
    if (versions.size <= 1) {continue;}

    // Find most common version
    const versionCounts = Array.from(versions.entries()).map(([ver, pkgs]) => ({
      version: ver,
      count: pkgs.size,
      packages: Array.from(pkgs),
    }));

    versionCounts.sort((a, b) => b.count - a.count);
    const targetVersion = versionCounts[0]?.version;
    if (!targetVersion) {continue;}

    // Align all packages to target version
    for (const { version, packages: pkgNames } of versionCounts.slice(1)) {
      aligned.push({
        dep,
        from: version,
        to: targetVersion,
        packages: pkgNames,
      });

      if (!dryRun) {
        // Apply changes to package.json files
        for (const pkgName of pkgNames) {
          const pkg = packages.find(p => p.name === pkgName);
          if (!pkg) {continue;}

          if (pkg.json.dependencies?.[dep]) {
            pkg.json.dependencies[dep] = targetVersion;
          }
          if (pkg.json.devDependencies?.[dep]) {
            pkg.json.devDependencies[dep] = targetVersion;
          }

          fs.writeFileSync(pkg.path, JSON.stringify(pkg.json, null, 2) + '\n');
        }
      }
    }
  }

  return aligned;
}

/**
 * Add missing workspace dependencies
 */
async function addMissingWorkspaceDeps(
  packages: Array<{ name: string; path: string; json: any }>,
  dryRun: boolean
): Promise<Array<{ package: string; dep: string; version: string }>> {
  const added: Array<{ package: string; dep: string; version: string }> = [];

  // Build map of workspace packages
  const workspacePackages = new Map<string, string>();
  for (const pkg of packages) {
    if (pkg.name.startsWith('@kb-labs/')) {
      workspacePackages.set(pkg.name, 'workspace:*');
    }
  }

  // Check each package for missing workspace deps
  for (const pkg of packages) {
    const packageDir = path.dirname(pkg.path);
    const srcDir = path.join(packageDir, 'src');

    if (!fs.existsSync(srcDir)) {continue;}

    // Scan imports
    const imports = scanImports(srcDir);
    const currentDeps = {
      ...pkg.json.dependencies,
      ...pkg.json.devDependencies,
    };

    for (const imp of imports) {
      if (imp.startsWith('@kb-labs/') && workspacePackages.has(imp) && !currentDeps[imp]) {
        added.push({
          package: pkg.name,
          dep: imp,
          version: 'workspace:*',
        });

        if (!dryRun) {
          if (!pkg.json.dependencies) {
            pkg.json.dependencies = {};
          }
          pkg.json.dependencies[imp] = 'workspace:*';
          fs.writeFileSync(pkg.path, JSON.stringify(pkg.json, null, 2) + '\n');
        }
      }
    }
  }

  return added;
}

/**
 * Remove unused dependencies
 */
async function removeUnusedDeps(
  packages: Array<{ name: string; path: string; json: any }>,
  dryRun: boolean
): Promise<Array<{ package: string; dep: string }>> {
  const removed: Array<{ package: string; dep: string }> = [];

  for (const pkg of packages) {
    const packageDir = path.dirname(pkg.path);
    const srcDir = path.join(packageDir, 'src');

    if (!fs.existsSync(srcDir)) {continue;}

    // Scan imports
    const imports = new Set(scanImports(srcDir));

    const deps = {
      ...pkg.json.dependencies,
      ...pkg.json.devDependencies,
    };

    for (const dep of Object.keys(deps)) {
      // Skip protected dependencies
      if (isProtectedDep(dep)) {continue;}

      // Check if dependency is used
      if (!imports.has(dep)) {
        removed.push({
          package: pkg.name,
          dep,
        });

        if (!dryRun) {
          delete pkg.json.dependencies?.[dep];
          delete pkg.json.devDependencies?.[dep];
          fs.writeFileSync(pkg.path, JSON.stringify(pkg.json, null, 2) + '\n');
        }
      }
    }
  }

  return removed;
}

/**
 * Scan directory for imports
 */
function scanImports(dir: string): string[] {
  const imports: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Match import statements
        const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const imp = match[1];
          if (!imp) {continue;}
          // Extract package name (handle scoped packages)
          const pkgName = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
          if (pkgName) {
            imports.push(pkgName);
          }
        }
      }
    }
  }

  walk(dir);
  return Array.from(new Set(imports));
}

/**
 * Check if dependency is protected (build tools, etc.)
 */
function isProtectedDep(dep: string): boolean {
  const protectedDeps = [
    'typescript',
    'tsup',
    'esbuild',
    'vite',
    'rollup',
    'rimraf',
    'vitest',
    'jest',
    'playwright',
    'eslint',
    'prettier',
  ];

  return protectedDeps.some(p => dep === p || dep.startsWith(`${p}-`) || dep.startsWith(`@${p}/`));
}

/**
 * Output dependency statistics
 */
function outputStats(stats: any, flags: any, ui: any) {
  if (flags.json) {
    ui?.json?.(stats);
    return;
  }

  const sections: Array<{ header: string; items: string[] }> = [];

  sections.push({
    header: 'Overview',
    items: [
      `Total Packages: ${stats.totalPackages}`,
      `Total Dependencies: ${stats.totalDeps}`,
      `Duplicate Versions: ${stats.duplicates}`,
    ],
  });

  if (stats.topUsed.length > 0) {
    sections.push({
      header: 'Top 10 Most Used',
      items: stats.topUsed.map((d: any) => `${d.name} (${d.count} packages)`),
    });
  }

  ui?.success?.('Dependency statistics', {
    title: '📊 Dependency Statistics',
    sections,
  });
}

/**
 * Output fix results
 */
function outputResults(result: FixResult, flags: any, ui: any) {
  if (flags.json) {
    ui?.json?.(result);
    return;
  }

  const sections: Array<{ header: string; items: string[] }> = [];

  // Summary
  const summaryItems = [
    `Packages Scanned: ${result.packagesScanned}`,
    `Mode: ${result.dryRun ? '🔍 Dry Run (no changes applied)' : '✅ Changes Applied'}`,
  ];
  sections.push({ header: 'Summary', items: summaryItems });

  // Aligned dependencies
  if (result.alignedDeps.length > 0) {
    const alignedItems = result.alignedDeps.map(
      a => `${a.dep}: ${a.from} → ${a.to} (${a.packages.length} packages)`
    );
    sections.push({ header: 'Aligned Versions', items: alignedItems.slice(0, 10) });
    if (result.alignedDeps.length > 10) {
      const lastSection = sections[sections.length - 1];
      if (lastSection) {
        lastSection.items.push(`... and ${result.alignedDeps.length - 10} more`);
      }
    }
  }

  // Added dependencies
  if (result.addedDeps.length > 0) {
    const addedItems = result.addedDeps.map(a => `${a.package}: +${a.dep}`);
    sections.push({ header: 'Added Dependencies', items: addedItems.slice(0, 10) });
    if (result.addedDeps.length > 10) {
      const lastSection = sections[sections.length - 1];
      if (lastSection) {
        lastSection.items.push(`... and ${result.addedDeps.length - 10} more`);
      }
    }
  }

  // Removed dependencies
  if (result.removedDeps.length > 0) {
    const removedItems = result.removedDeps.map(r => `${r.package}: -${r.dep}`);
    sections.push({ header: 'Removed Dependencies', items: removedItems.slice(0, 10) });
    if (result.removedDeps.length > 10) {
      const lastSection = sections[sections.length - 1];
      if (lastSection) {
        lastSection.items.push(`... and ${result.removedDeps.length - 10} more`);
      }
    }
  }

  // No changes
  if (
    result.alignedDeps.length === 0 &&
    result.addedDeps.length === 0 &&
    result.removedDeps.length === 0
  ) {
    sections.push({ header: 'Result', items: ['✅ No issues found!'] });
  }

  // Next steps for dry run
  if (result.dryRun && (result.alignedDeps.length > 0 || result.addedDeps.length > 0 || result.removedDeps.length > 0)) {
    sections.push({
      header: 'Next Steps',
      items: ['Remove --dry-run flag to apply changes', 'Run `pnpm install` after applying changes'],
    });
  }

  const title = result.dryRun ? '🔍 Dependency Fix Preview' : '✅ Dependency Fix Complete';

  ui?.success?.('Dependency fix completed', {
    title,
    sections,
  });
}
