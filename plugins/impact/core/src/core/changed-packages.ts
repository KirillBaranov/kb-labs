import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangedPackage, SubRepo } from '@kb-labs/impact-contracts';
import { listSubRepos } from './workspace.js';

function git(cwd: string, args: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function getSubmodulePointer(workspaceRoot: string, repoPath: string): string {
  const out = git(workspaceRoot, `ls-tree HEAD ${repoPath}`);
  const parts = out.split(/\s+/);
  return parts[2] || '';
}

function getActualHead(fullPath: string): string {
  return git(fullPath, 'rev-parse HEAD');
}

function findPackagesInRepo(workspaceRoot: string, repo: SubRepo): ChangedPackage[] {
  const fullRepoPath = join(workspaceRoot, repo.path);
  const packagesDir = join(fullRepoPath, 'packages');
  const results: ChangedPackage[] = [];

  if (!existsSync(packagesDir)) {
    // Repo without packages/ — treat entire repo as one package
    const pkgJsonPath = join(fullRepoPath, 'package.json');
    if (!existsSync(pkgJsonPath)) {return [];}
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      if (pkg.name?.startsWith('@kb-labs/')) {
        results.push({ name: pkg.name, repo: repo.path, changedFiles: 1 });
      }
    } catch { /* skip */ }
    return results;
  }

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {continue;}
    const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) {continue;}
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      if (!pkg.name?.startsWith('@kb-labs/')) {continue;}

      // Count changed files in this package
      const pointerSha = getSubmodulePointer(workspaceRoot, repo.path);
      let changedFiles = 0;
      if (pointerSha) {
        const diff = git(fullRepoPath, `diff ${pointerSha}..HEAD --name-only -- packages/${entry.name}/src/`);
        changedFiles = diff ? diff.split('\n').filter(Boolean).length : 0;
      } else {
        // Fallback: count dirty files
        const status = git(fullRepoPath, `status --porcelain -- packages/${entry.name}/src/`);
        changedFiles = status ? status.split('\n').filter(Boolean).length : 0;
      }

      if (changedFiles > 0) {
        results.push({ name: pkg.name, repo: repo.path, changedFiles });
      }
    } catch { /* skip */ }
  }

  return results;
}

export function detectChangedPackages(workspaceRoot: string): ChangedPackage[] {
  const repos = listSubRepos(workspaceRoot);
  const changed: ChangedPackage[] = [];

  for (const repo of repos) {
    const fullPath = join(workspaceRoot, repo.path);
    if (!existsSync(join(fullPath, '.git'))) {continue;}

    const pointerSha = getSubmodulePointer(workspaceRoot, repo.path);
    const actualSha = getActualHead(fullPath);

    // Skip if no changes
    if (pointerSha && pointerSha === actualSha) {continue;}

    // Also check dirty working tree
    if (pointerSha === actualSha) {
      const dirty = git(fullPath, 'status --porcelain');
      if (!dirty) {continue;}
    }

    const pkgs = findPackagesInRepo(workspaceRoot, repo);
    changed.push(...pkgs);
  }

  return changed;
}
