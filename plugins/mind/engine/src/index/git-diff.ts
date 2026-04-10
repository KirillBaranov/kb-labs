/**
 * @module @kb-labs/mind-engine/index/git-diff
 * Git-based diff detection for incremental indexing
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

/**
 * Changed file information from git diff
 */
export interface ChangedFile {
  /** Relative file path */
  path: string;

  /** Change status */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

  /** Original path (for renames/copies) */
  oldPath?: string;
}

/**
 * Git diff detector options
 */
export interface GitDiffOptions {
  /** Working directory (defaults to cwd) */
  cwd?: string;

  /** Include untracked files */
  includeUntracked?: boolean;
}

/**
 * Git operations for incremental indexing
 */
export class GitDiffDetector {
  private readonly cwd: string;

  constructor(options: GitDiffOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
  }

  /**
   * Get current HEAD revision
   */
  async getCurrentRevision(): Promise<string> {
    const { stdout } = await exec('git rev-parse HEAD', { cwd: this.cwd });
    return stdout.trim();
  }

  /**
   * Get short revision hash
   */
  async getShortRevision(): Promise<string> {
    const { stdout } = await exec('git rev-parse --short HEAD', { cwd: this.cwd });
    return stdout.trim();
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: this.cwd });
    return stdout.trim();
  }

  /**
   * Get merge-base between two revisions
   */
  async getMergeBase(rev1: string, rev2: string): Promise<string> {
    try {
      const { stdout } = await exec(`git merge-base ${rev1} ${rev2}`, { cwd: this.cwd });
      return stdout.trim();
    } catch {
      // If merge-base fails (no common ancestor), return rev1
      return rev1;
    }
  }

  /**
   * Check if rev1 is an ancestor of rev2
   */
  async isAncestor(rev1: string, rev2: string): Promise<boolean> {
    try {
      await exec(`git merge-base --is-ancestor ${rev1} ${rev2}`, { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get files changed since a revision
   */
  async getChangedFiles(since: string): Promise<ChangedFile[]> {
    try {
      // Use three-dot notation to get changes from merge-base
      const { stdout } = await exec(
        `git diff --name-status ${since}...HEAD`,
        { cwd: this.cwd }
      );

      return this.parseNameStatus(stdout);
    } catch {
      // If three-dot fails, try two-dot
      try {
        const { stdout } = await exec(
          `git diff --name-status ${since}..HEAD`,
          { cwd: this.cwd }
        );
        return this.parseNameStatus(stdout);
      } catch {
        return [];
      }
    }
  }

  /**
   * Get files changed between two revisions (inclusive)
   */
  async getChangedFilesBetween(from: string, to: string): Promise<ChangedFile[]> {
    const { stdout } = await exec(
      `git diff --name-status ${from}..${to}`,
      { cwd: this.cwd }
    );

    return this.parseNameStatus(stdout);
  }

  /**
   * Get uncommitted changes (staged + unstaged)
   */
  async getUncommittedChanges(): Promise<ChangedFile[]> {
    // Staged changes
    const { stdout: staged } = await exec('git diff --name-status --cached', { cwd: this.cwd });

    // Unstaged changes
    const { stdout: unstaged } = await exec('git diff --name-status', { cwd: this.cwd });

    const stagedFiles = this.parseNameStatus(staged);
    const unstagedFiles = this.parseNameStatus(unstaged);

    // Merge and deduplicate
    const pathMap = new Map<string, ChangedFile>();

    for (const file of [...stagedFiles, ...unstagedFiles]) {
      // Later entries (unstaged) override earlier (staged) for same path
      pathMap.set(file.path, file);
    }

    return Array.from(pathMap.values());
  }

  /**
   * Get untracked files
   */
  async getUntrackedFiles(): Promise<string[]> {
    const { stdout } = await exec(
      'git ls-files --others --exclude-standard',
      { cwd: this.cwd }
    );

    return stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Check if a file is tracked by git
   */
  async isTracked(path: string): Promise<boolean> {
    try {
      await exec(`git ls-files --error-unmatch ${path}`, { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if working directory is clean
   */
  async isClean(): Promise<boolean> {
    const { stdout } = await exec('git status --porcelain', { cwd: this.cwd });
    return stdout.trim() === '';
  }

  /**
   * Get all files at a specific revision
   */
  async getFilesAtRevision(revision: string): Promise<string[]> {
    const { stdout } = await exec(
      `git ls-tree -r --name-only ${revision}`,
      { cwd: this.cwd }
    );

    return stdout.trim().split('\n').filter(Boolean);
  }

  /**
   * Get file content at a specific revision
   */
  async getFileContentAtRevision(path: string, revision: string): Promise<string> {
    const { stdout } = await exec(
      `git show ${revision}:${path}`,
      { cwd: this.cwd }
    );

    return stdout;
  }

  /**
   * Parse git diff --name-status output
   */
  private parseNameStatus(output: string): ChangedFile[] {
    const lines = output.trim().split('\n').filter(Boolean);
    const files: ChangedFile[] = [];

    for (const line of lines) {
      const parts = line.split('\t');
      const statusCode = parts[0]?.[0];

      if (!statusCode) {continue;}

      const status = this.parseStatusCode(statusCode);
      const path = parts[1] ?? '';

      if (!path) {continue;}

      const file: ChangedFile = { path, status };

      // Handle renames (R100) and copies (C100)
      if (statusCode === 'R' || statusCode === 'C') {
        file.oldPath = parts[1];
        file.path = parts[2] ?? parts[1] ?? '';
      }

      files.push(file);
    }

    return files;
  }

  /**
   * Parse single status code
   */
  private parseStatusCode(code: string): ChangedFile['status'] {
    switch (code) {
      case 'A':
        return 'added';
      case 'M':
        return 'modified';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      default:
        return 'modified';
    }
  }
}

/**
 * Create a git diff detector
 */
export function createGitDiffDetector(options?: GitDiffOptions): GitDiffDetector {
  return new GitDiffDetector(options);
}
