/**
 * Lifecycle of the one-shot staging worktree.
 *
 * The worktree is created outside the repository (in the OS temp directory),
 * detached at the intent's `plannedCommit`, and removed together with its
 * administrative entry under `.git/worktrees`. Failure to remove it would be
 * worse than a leaked temp directory: a dangling worktree registration keeps
 * `git worktree list` reporting a checkout that no longer exists, so `dispose`
 * always prunes even when removal failed.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git, gitOrThrow, resolveCommit } from './git.js';

export interface StagingWorktree {
  /** Absolute path of the disposable checkout. */
  path: string;
  /** Repository the worktree belongs to. */
  repoRoot: string;
  /** Commit the worktree is detached at. */
  commit: string;
  /** Idempotent: safe to call twice, and safe to call after a partial failure. */
  dispose: () => void;
}

function uniqueWorktreePath(label: string): string {
  const parent = mkdtempSync(join(tmpdir(), 'kb-release-stage-'));
  // `git worktree add` requires the target not to exist yet.
  return join(parent, label.replace(/[^A-Za-z0-9._-]+/g, '-') || 'staging');
}

/**
 * Creates a detached worktree at `commit`.
 *
 * Throws if the commit is unknown to the repository — staging a release from a
 * commit that does not exist locally would otherwise silently produce a tree
 * built from whatever `git` decided to check out instead.
 */
export function createStagingWorktree(repoRoot: string, commit: string, label = 'staging'): StagingWorktree {
  const resolved = resolveCommit(repoRoot, `${commit}^{commit}`);
  const path = uniqueWorktreePath(label);
  const parent = join(path, '..');

  try {
    gitOrThrow(repoRoot, ['worktree', 'add', '--detach', '--no-checkout', path, resolved]);
    gitOrThrow(path, ['checkout', '--detach', resolved]);
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    git(repoRoot, ['worktree', 'prune']);
    throw error;
  }

  let disposed = false;
  return {
    path,
    repoRoot,
    commit: resolved,
    dispose(): void {
      if (disposed) { return; }
      disposed = true;
      if (existsSync(path)) {
        git(repoRoot, ['worktree', 'remove', '--force', path]);
      }
      rmSync(parent, { recursive: true, force: true });
      // Unconditional: `worktree remove` fails whenever the directory is
      // already gone, and the administrative entry must not survive that.
      git(repoRoot, ['worktree', 'prune']);
    },
  };
}

/**
 * Runs `work` against a fresh staging worktree and disposes of it afterwards.
 *
 * Callers that need the worktree to survive the call (staging, so that
 * `package` and `commit` can use the same tree) must not use this helper —
 * they own `dispose` themselves.
 */
export async function withStagingWorktree<T>(
  repoRoot: string,
  commit: string,
  label: string,
  work: (worktree: StagingWorktree) => Promise<T>,
): Promise<T> {
  const worktree = createStagingWorktree(repoRoot, commit, label);
  try {
    return await work(worktree);
  } finally {
    worktree.dispose();
  }
}

/** Removes a staging worktree recorded in state, tolerating one already gone. */
export function disposeStagingWorktreeAt(repoRoot: string, path: string): void {
  if (existsSync(path)) {
    git(repoRoot, ['worktree', 'remove', '--force', path]);
  }
  rmSync(join(path, '..'), { recursive: true, force: true });
  git(repoRoot, ['worktree', 'prune']);
}
