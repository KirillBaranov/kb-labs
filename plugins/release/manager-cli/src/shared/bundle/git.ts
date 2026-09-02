/**
 * Git primitives for the disposable staging worktree (cutover plan §6A.2).
 *
 * Every release mutation before approval happens in a throwaway worktree
 * checked out from the intent's `plannedCommit`, never in the primary working
 * tree and never on `master` (execution plan §3.4, consequence 1). These
 * helpers are deliberately thin `git` invocations rather than a library: the
 * exact plumbing commands used here (`worktree add --detach`, `write-tree`,
 * `ls-tree`) are the contract, and a higher-level wrapper that silently
 * switched to a porcelain equivalent could touch the primary index.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[]): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function gitOrThrow(cwd: string, args: string[]): string {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

/**
 * Content digest of a git tree.
 *
 * The contract requires a SHA-256 (`treeSha256`), while git object names are
 * SHA-1, so this hashes the *recursive listing* of the tree — mode, type,
 * object id and path for every file — rather than the tree object name. That
 * keeps the digest a genuine function of the staged content, independent of
 * the repository's object-format setting, and lets `release commit` recompute
 * it from the created commit and compare it with `provenance.treeSha256`.
 */
export function treeSha256(cwd: string, treeish: string): string {
  const listing = gitOrThrow(cwd, ['ls-tree', '-r', '--full-tree', treeish]);
  return createHash('sha256').update(listing, 'utf8').digest('hex');
}

/**
 * Writes the worktree's current content into a tree object and digests it.
 *
 * `add --all` writes to *this worktree's own index* (`.git/worktrees/<id>/index`),
 * which is why staging is safe to abandon: nothing it stages is visible to the
 * primary working tree or to any other worktree.
 */
export function writeTreeSha256(worktreePath: string): { gitTree: string; treeSha256: string } {
  gitOrThrow(worktreePath, ['add', '--all']);
  const gitTree = gitOrThrow(worktreePath, ['write-tree']).trim();
  return { gitTree, treeSha256: treeSha256(worktreePath, gitTree) };
}

export function resolveCommit(cwd: string, ref: string): string {
  return gitOrThrow(cwd, ['rev-parse', ref]).trim();
}
