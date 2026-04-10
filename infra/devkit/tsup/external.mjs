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
        // Silent fail in library mode
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
        } catch {
          // Silent fail
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
    } catch {
      // Silent fail
    }
  }
  
  // Combine workspace packages and local dependencies, remove duplicates
  return Array.from(new Set([...workspacePackages, ...localDeps])).sort();
}


