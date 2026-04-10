import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SubRepo } from '@kb-labs/impact-contracts';

export function findWorkspaceRoot(cwd?: string): string {
  let dir = resolve(cwd ?? process.cwd());
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.gitmodules')) || existsSync(join(dir, '.kb', 'kb.config.json'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {break;}
    dir = parent;
  }
  throw new Error('Could not find workspace root (no .gitmodules or .kb/kb.config.json found)');
}

/**
 * Parse .gitmodules to get submodule paths.
 * Returns entries like { path: "platform/kb-labs-core", name: "kb-labs-core", category: "platform" }.
 * Falls back to scanning top-level dirs for .git (flat layout).
 */
export function listSubRepos(workspaceRoot: string): SubRepo[] {
  const gitmodulesPath = join(workspaceRoot, '.gitmodules');

  if (existsSync(gitmodulesPath)) {
    return parseSubReposFromGitmodules(gitmodulesPath, workspaceRoot);
  }

  // Fallback: flat layout — top-level dirs with .git
  return scanFlatLayout(workspaceRoot);
}

function parseSubReposFromGitmodules(gitmodulesPath: string, workspaceRoot: string): SubRepo[] {
  const repos: SubRepo[] = [];
  try {
    const content = readFileSync(gitmodulesPath, 'utf-8');
    const pathMatches = content.matchAll(/^\s*path\s*=\s*(.+)$/gm);
    for (const match of pathMatches) {
      const relPath = (match[1] ?? '').trim();
      if (!relPath) {continue;}

      const fullPath = join(workspaceRoot, relPath);
      if (!existsSync(join(fullPath, '.git')) && !existsSync(join(fullPath, 'package.json'))) {
        continue;
      }

      const parts = relPath.split('/');
      const name = parts.at(-1) ?? relPath;
      const category = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      repos.push({ path: relPath, category, name });
    }
  } catch {
    // ignore parse errors
  }
  return repos;
}

function scanFlatLayout(workspaceRoot: string): SubRepo[] {
  const repos: SubRepo[] = [];
  try {
    for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {continue;}
      const fullPath = join(workspaceRoot, entry.name);
      if (existsSync(join(fullPath, '.git')) || existsSync(join(fullPath, 'package.json'))) {
        repos.push({ path: entry.name, category: '', name: entry.name });
      }
    }
  } catch {
    // ignore
  }
  return repos;
}
