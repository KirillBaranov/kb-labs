#!/usr/bin/env node

import { dirname, resolve, join } from 'node:path';
import { promises as fs } from 'node:fs';
import process from 'node:process';
import { glob } from 'glob';
import { parse as parseYaml } from 'yaml';

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function findWorkspaceConfigs(startDir) {
  const roots = [];
  let current = resolve(startDir);
  let prev = null;
  while (current !== prev) {
    const wsFile = join(current, 'pnpm-workspace.yaml');
    if (await exists(wsFile)) {
      try {
        const yaml = await fs.readFile(wsFile, 'utf8');
        const data = parseYaml(yaml);
        const patterns = Array.isArray(data?.packages) ? data.packages.filter(Boolean) : [];
        roots.push({ dir: current, patterns });
      } catch (error) {
        console.warn('[devkit-tsup-external] failed to read workspace config', wsFile, error);
      }
    }
    prev = current;
    current = dirname(current);
  }
  return roots;
}

async function collectWorkspacePackages(workspaceRoots) {
  const packages = new Set();
  
  for (const { dir, patterns } of workspaceRoots) {
    for (const pattern of patterns) {
      if (!pattern || typeof pattern !== 'string') {continue;}
      const searchPattern = pattern.endsWith('/') ? `${pattern}package.json` : join(pattern, 'package.json');
      const matches = await glob(searchPattern, {
        cwd: dir,
        dot: false,
        nodir: true,
        ignore: ['**/node_modules/**', '**/dist/**'],
      });
      for (const match of matches) {
        try {
          const pkgPath = resolve(dir, match);
          const pkg = await readJson(pkgPath);
          if (!pkg?.name || typeof pkg.name !== 'string') {continue;}
          if (!pkg.name.startsWith('@kb-labs/')) {continue;}
          packages.add(pkg.name);
        } catch (error) {
          console.warn('[devkit-tsup-external] failed to read package', match, error);
        }
      }
    }
  }
  
  return Array.from(packages).sort();
}

/**
 * Resolves external dependencies for tsup bundling.
 * Returns an array of package names that should be marked as external:
 * - All @kb-labs/* workspace packages
 * - All dependencies and peerDependencies from the current package.json
 * 
 * @param {string} [cwd] - Current working directory (defaults to process.cwd())
 * @returns {Promise<string[]>} Array of external package names
 */
export async function resolveTsupExternal(cwd = process.cwd()) {
  const workspaceRoots = await findWorkspaceConfigs(cwd);
  if (!workspaceRoots.length) {
    console.warn('[devkit-tsup-external] no pnpm-workspace.yaml found up the tree');
    return [];
  }

  const workspacePackages = await collectWorkspacePackages(workspaceRoots);
  
  // Also include dependencies from current package.json
  const pkgPath = join(cwd, 'package.json');
  let localDeps = [];
  if (await exists(pkgPath)) {
    try {
      const pkg = await readJson(pkgPath);
      const deps = Object.keys(pkg.dependencies ?? {});
      const peerDeps = Object.keys(pkg.peerDependencies ?? {});
      localDeps = Array.from(new Set([...deps, ...peerDeps]));
    } catch (error) {
      console.warn('[devkit-tsup-external] failed to read local package.json', error);
    }
  }
  
  // Combine workspace packages and local dependencies, remove duplicates
  return Array.from(new Set([...workspacePackages, ...localDeps])).sort();
}

// CLI mode: generate tsup.external.json file
async function generateExternalFile(rootDir) {
  const externals = await resolveTsupExternal(rootDir);
  
  const output = {
    $schema: 'https://json.schemastore.org/tsconfig',
    externals: externals,
  };
  
  const outPath = join(rootDir, 'tsup.external.json');
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[devkit-tsup-external] wrote ${externals.length} external packages to ${outPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Default behavior: generate file
  if (args.length === 0 || args.includes('--generate') || args.includes('-g')) {
    const rootDir = process.cwd();
    await generateExternalFile(rootDir);
  } else if (args.includes('--print') || args.includes('-p')) {
    // Print externals (for testing)
    const externals = await resolveTsupExternal();
    console.log(JSON.stringify(externals, null, 2));
  } else {
    console.error('Usage: kb-devkit-tsup-external [--generate|-g] [--print|-p]');
    process.exit(1);
  }
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[devkit-tsup-external] failed', error);
    process.exit(1);
  });
}

