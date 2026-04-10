/**
 * @module @kb-labs/core/sys/repo
 * Repository root discovery. Pure infrastructure, no domain keys.
 */

import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { promises as fsp } from "node:fs";
import type { SubRepo } from '../types/index.js';

/**
 * Find repository root by searching for markers in priority order.
 * First searches entire tree for pnpm-workspace.yaml (monorepo root),
 * then .git, then package.json as fallback.
 */
export async function findRepoRoot(startDir = process.cwd()): Promise<string> {
    const markersPriority = ["pnpm-workspace.yaml", ".git", "package.json"];

    // Try each marker in priority order, searching entire tree each time
    for (const marker of markersPriority) {
        let dir = path.resolve(startDir);
        while (true) {
            try {
                await fsp.access(path.join(dir, marker));
                return dir; // Found it!
            } catch {
                // Continue searching upward
            }

            const parent = path.dirname(dir);
            if (parent === dir) {
                // Reached filesystem root without finding this marker
                break;
            }
            dir = parent;
        }
    }

    // Fallback: return current directory if nothing found
    return path.resolve(startDir);
}

/**
 * Discover all sub-repository absolute paths in a monorepo root.
 *
 * Reads paths from `.gitmodules` — no hardcoded category directories.
 * Falls back to scanning top-level dirs for `.git` (flat layout).
 *
 * @returns Absolute paths to each sub-repo that exists on disk.
 */
export function discoverSubRepoPaths(repoRoot: string): string[] {
  const gitmodulesPath = path.join(repoRoot, '.gitmodules');

  if (existsSync(gitmodulesPath)) {
    try {
      const content = readFileSync(gitmodulesPath, 'utf-8');
      const results: string[] = [];
      for (const match of content.matchAll(/^\s*path\s*=\s*(.+)$/gm)) {
        const relPath = (match[1] ?? '').trim();
        if (!relPath) { continue; }
        const fullPath = path.join(repoRoot, relPath);
        if (existsSync(fullPath)) { results.push(fullPath); }
      }
      if (results.length > 0) { return results; }
    } catch {
      // fall through to filesystem scan
    }
  }

  // Fallback: flat layout — top-level dirs with .git
  const results: string[] = [];
  try {
    for (const entry of readdirSync(repoRoot)) {
      if (entry.startsWith('.') || entry === 'node_modules') { continue; }
      const fullPath = path.join(repoRoot, entry);
      try {
        if (statSync(fullPath).isDirectory() && existsSync(path.join(fullPath, '.git'))) {
          results.push(fullPath);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

/**
 * Like discoverSubRepoPaths but returns structured SubRepo objects
 * with path, category, name, and absolutePath fields.
 */
export function discoverSubRepos(repoRoot: string): SubRepo[] {
  const gitmodulesPath = path.join(repoRoot, '.gitmodules');

  if (existsSync(gitmodulesPath)) {
    try {
      const content = readFileSync(gitmodulesPath, 'utf-8');
      const results: SubRepo[] = [];
      for (const match of content.matchAll(/^\s*path\s*=\s*(.+)$/gm)) {
        const relPath = (match[1] ?? '').trim();
        if (!relPath) { continue; }
        const absolutePath = path.join(repoRoot, relPath);
        if (!existsSync(absolutePath)) { continue; }
        const parts = relPath.split('/');
        const name = parts.at(-1) ?? relPath;
        const category = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        results.push({ path: relPath, category, name, absolutePath });
      }
      if (results.length > 0) { return results; }
    } catch { /* fall through */ }
  }

  // Fallback: flat layout — top-level dirs with .git
  const results: SubRepo[] = [];
  try {
    for (const entry of readdirSync(repoRoot)) {
      if (entry.startsWith('.') || entry === 'node_modules') { continue; }
      const absolutePath = path.join(repoRoot, entry);
      try {
        if (statSync(absolutePath).isDirectory() &&
            existsSync(path.join(absolutePath, '.git'))) {
          results.push({ path: entry, category: '', name: entry, absolutePath });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}