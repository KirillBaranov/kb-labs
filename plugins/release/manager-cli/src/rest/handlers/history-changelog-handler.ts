/**
 * History changelog handler - Get specific changelog from history
 *
 * Reads: .kb/release/history/{scope}/{id}/changelog.md
 */

import { defineHandler, findRepoRoot, type RestInput } from '@kb-labs/sdk';
import type { HistoryChangelogResponse } from '@kb-labs/release-manager-contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scopeToDir } from '../../shared/utils';

export interface HistoryChangelogParams {
  scope: string;  // Scope (e.g., "root" or "@kb-labs/shared")
  id: string;     // Release ID (folder name like 2026-01-04T12-30-00Z)
}

export default defineHandler({
  async execute(ctx, input: RestInput<unknown, unknown, HistoryChangelogParams>): Promise<HistoryChangelogResponse> {
    const { scope, id } = input.params!;
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);

    const scopeDir = scopeToDir(scope);
    const changelogPath = join(repoRoot, '.kb/release/history', scopeDir, id, 'changelog.md');

    try {
      const markdown = await readFile(changelogPath, 'utf-8');

      return {
        id,
        markdown,
        scope,
      };
    } catch (error) {
      throw new Error(`Failed to read changelog for ${scope}/${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
