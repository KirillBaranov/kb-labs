import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DepGraphNode } from '@kb-labs/impact-contracts';
import { listSubRepos } from './workspace.js';

function discoverPackages(workspaceRoot: string): Array<{ name: string; repo: string; deps: string[] }> {
  const repos = listSubRepos(workspaceRoot);
  const packages: Array<{ name: string; repo: string; deps: string[] }> = [];

  for (const repo of repos) {
    const fullRepoPath = join(workspaceRoot, repo.path);
    const packagesDir = join(fullRepoPath, 'packages');

    const dirs = existsSync(packagesDir)
      ? readdirSync(packagesDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => join(packagesDir, d.name))
      : [fullRepoPath]; // repo without packages/

    for (const dir of dirs) {
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) {continue;}
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (!pkg.name?.startsWith('@kb-labs/')) {continue;}
        const allDeps = { ...pkg.dependencies };
        const kbDeps = Object.keys(allDeps).filter((d) => d.startsWith('@kb-labs/'));
        packages.push({ name: pkg.name, repo: repo.path, deps: kbDeps });
      } catch { /* skip */ }
    }
  }

  return packages;
}

export function buildReverseDependencyGraph(workspaceRoot: string): Map<string, DepGraphNode> {
  const packages = discoverPackages(workspaceRoot);
  const graph = new Map<string, DepGraphNode>();

  // Initialize nodes
  for (const pkg of packages) {
    graph.set(pkg.name, {
      name: pkg.name,
      repo: pkg.repo,
      dependsOn: pkg.deps,
      dependedBy: [],
    });
  }

  // Build reverse edges
  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      const node = graph.get(dep);
      if (node) {
        node.dependedBy.push(pkg.name);
      }
    }
  }

  return graph;
}
