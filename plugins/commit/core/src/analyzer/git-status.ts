/**
 * Git status analysis
 */

import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import type { GitStatus } from "@kb-labs/commit-contracts";

/**
 * Get current git status (staged, unstaged, untracked files).
 * cwd must already point to the resolved scope directory.
 */
export async function getGitStatus(cwd: string): Promise<GitStatus> {
  // --ignore-submodules=all: exclude submodule pointer drift in worktrees
  const git: SimpleGit = simpleGit(cwd);
  const status: StatusResult = await git.status(['--ignore-submodules=all']);

  return {
    staged: status.staged.filter((f) => !shouldIgnoreFile(f)),
    unstaged: [...status.modified, ...status.deleted]
      .filter((f) => !status.staged.includes(f))
      .filter((f) => !shouldIgnoreFile(f)),
    untracked: status.not_added.filter((f) => !shouldIgnoreFile(f)),
  };
}

/**
 * Check if file should be ignored (node_modules, dist, etc.)
 */
function shouldIgnoreFile(file: string): boolean {
  const ignoredPaths = [
    "node_modules/",
    ".git/",
    "dist/",
    "build/",
    ".next/",
    ".turbo/",
    "coverage/",
    ".cache/",
    ".temp/",
    "tmp/",
  ];

  return ignoredPaths.some((path) => file.includes(path));
}

/**
 * Get all changed files (staged + unstaged + untracked)
 * Filters out node_modules and other build artifacts
 */
export function getAllChangedFiles(status: GitStatus): string[] {
  const allFiles = [
    ...new Set([...status.staged, ...status.unstaged, ...status.untracked]),
  ];
  return allFiles.filter((file) => !shouldIgnoreFile(file));
}

/**
 * Check if there are any changes
 */
export function hasChanges(status: GitStatus): boolean {
  return (
    status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    status.untracked.length > 0
  );
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
  return branch.trim();
}

/**
 * Check if branch is protected (main/master)
 */
export function isProtectedBranch(branch: string): boolean {
  const protectedBranches = [
    "main",
    "master",
    "develop",
    "release",
    "production",
  ];
  return protectedBranches.includes(branch.toLowerCase());
}
