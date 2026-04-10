/**
 * Git diff indexer for KB Labs Mind
 */

import { gitDiffSince } from '@kb-labs/mind-adapters';
import type { IndexerContext } from '../types/index';

/**
 * Index git diff since a specific revision
 */
export async function indexGitDiff(
  ctx: IndexerContext,
  since?: string
): Promise<{ files: number }> {
  if (!since) {
    return { files: 0 };
  }

  try {
    const diff = await gitDiffSince(ctx.cwd, since);
    return { files: diff.files.length };
  } catch (error: any) {
    // Fail-open: continue with empty diff
    ctx.log({ 
      level: 'warn', 
      code: 'MIND_NO_GIT', 
      msg: 'Git diff failed, continuing with empty diff', 
      error: error.message 
    });
    return { files: 0 };
  }
}
