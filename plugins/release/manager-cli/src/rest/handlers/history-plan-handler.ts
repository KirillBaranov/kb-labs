/**
 * History plan handler - Get specific release plan from history
 *
 * Reads: .kb/release/history/{scope}/{id}/plan.json
 */

import { defineHandler, findRepoRoot, type RestInput } from '@kb-labs/sdk';
import type { HistoryPlanResponse, ReleasePlan } from '@kb-labs/release-manager-contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scopeToDir } from '../../shared/utils';

export interface HistoryPlanParams {
  scope: string;  // Scope (e.g., "root" or "@kb-labs/shared")
  id: string;     // Release ID (folder name like 2026-01-04T12-30-00Z)
}

export default defineHandler({
  async execute(ctx, input: RestInput<unknown, unknown, HistoryPlanParams>): Promise<HistoryPlanResponse> {
    const { scope, id } = input.params!;
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);

    const scopeDir = scopeToDir(scope);
    const planPath = join(repoRoot, '.kb/release/history', scopeDir, id, 'plan.json');

    try {
      const planRaw = await readFile(planPath, 'utf-8');
      const plan: ReleasePlan = JSON.parse(planRaw);

      return {
        id,
        plan,
      };
    } catch (error) {
      throw new Error(`Failed to read release plan for ${scope}/${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
});
