import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SubmoduleInfo } from '@kb-labs/qa-contracts';

/**
 * Get git submodule info for a repo directory.
 * Returns null if the directory is not a git repo.
 */
export function getSubmoduleInfo(repoDir: string, repoName: string): SubmoduleInfo | null {
  const gitDir = join(repoDir, '.git');
  if (!existsSync(gitDir)) {return null;}

  try {
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const message = execSync('git log -1 --format=%s', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const statusOutput = execSync('git status --porcelain', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return {
      name: repoName,
      commit,
      branch,
      dirty: statusOutput.length > 0,
      message,
    };
  } catch {
    return null;
  }
}

/**
 * Collect submodule info for all unique repos from a list of packages.
 * Caches by repo name to avoid redundant git calls.
 */
export function collectSubmoduleInfo(
  rootDir: string,
  repos: string[],
): Record<string, SubmoduleInfo> {
  const result: Record<string, SubmoduleInfo> = {};

  for (const repo of repos) {
    const repoDir = join(rootDir, repo);
    const info = getSubmoduleInfo(repoDir, repo);
    if (info) {
      result[repo] = info;
    }
  }

  return result;
}
