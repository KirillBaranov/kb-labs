/**
 * Index Freshness Detector
 *
 * Detects if the search index is stale compared to the
 * current git revision. Generates warnings for outdated indexes.
 */

import type { AgentWarning } from '../types';

export interface IndexFreshness {
  /** Index is up to date with repo */
  fresh: boolean;
  /** Git revision when index was created */
  indexedRevision?: string;
  /** Current git HEAD revision */
  currentRevision?: string;
  /** When index was created */
  indexedAt?: string;
  /** Number of files changed since indexing */
  changedFiles?: number;
  /** Human-readable status message */
  message: string;
}

export interface IndexMetadata {
  revision?: string;
  timestamp?: string;
  filesCount?: number;
}

/**
 * Check index freshness against current git state
 */
export async function checkIndexFreshness(
  indexMeta: IndexMetadata | undefined,
  execGit: (args: string[]) => Promise<string>,
): Promise<IndexFreshness> {
  // No metadata = unknown freshness
  if (!indexMeta || !indexMeta.revision) {
    return {
      fresh: true, // Assume fresh if no metadata
      message: 'Index metadata not available',
    };
  }

  try {
    // Get current HEAD
    const currentRevision = (await execGit(['rev-parse', 'HEAD'])).trim();

    // Same revision = fresh
    if (indexMeta.revision === currentRevision) {
      return {
        fresh: true,
        indexedRevision: indexMeta.revision,
        currentRevision,
        indexedAt: indexMeta.timestamp,
        message: 'Index is up to date',
      };
    }

    // Different revision - count changed files
    let changedFiles = 0;
    try {
      const diffOutput = await execGit([
        'diff',
        '--name-only',
        indexMeta.revision,
        currentRevision,
      ]);
      changedFiles = diffOutput.trim().split('\n').filter(Boolean).length;
    } catch {
      // Can't diff (maybe revision doesn't exist anymore)
      changedFiles = -1;
    }

    return {
      fresh: false,
      indexedRevision: indexMeta.revision,
      currentRevision,
      indexedAt: indexMeta.timestamp,
      changedFiles: changedFiles >= 0 ? changedFiles : undefined,
      message: changedFiles >= 0
        ? `Index may be outdated (${changedFiles} files changed since indexing)`
        : 'Index may be outdated (unable to determine changes)',
    };
  } catch (error) {
    // Git not available or not a repo
    return {
      fresh: true,
      message: 'Unable to check freshness (git not available)',
    };
  }
}

/**
 * Generate warning for stale index
 */
export function createStaleIndexWarning(freshness: IndexFreshness): AgentWarning | null {
  if (freshness.fresh) {
    return null;
  }

  return {
    code: 'STALE_INDEX',
    message: freshness.message,
    details: {
      expectedRevision: freshness.currentRevision,
      actualRevision: freshness.indexedRevision,
    },
  };
}

/**
 * Simple git executor using child_process
 * Can be replaced with runtime adapter in production
 */
export function createGitExecutor(cwd: string): (args: string[]) => Promise<string> {
  return async (args: string[]): Promise<string> => {
    // Dynamic import to avoid bundling issues
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  };
}

/**
 * Get index metadata from index file
 */
export async function readIndexMetadata(
  indexPath: string,
  readFile: (path: string) => Promise<string>,
): Promise<IndexMetadata | undefined> {
  try {
    const content = await readFile(indexPath);
    const data = JSON.parse(content);

    return {
      revision: data.meta?.gitRevision ?? data.gitRevision,
      timestamp: data.meta?.indexedAt ?? data.indexedAt,
      filesCount: data.meta?.filesCount ?? data.sources?.length,
    };
  } catch {
    return undefined;
  }
}
