/**
 * commit:reset command
 * Clear current commit plan
 */

import { defineCommand, findRepoRoot, type PluginContextV3 } from '@kb-labs/sdk';
import { clearPlan, hasPlan } from '@kb-labs/commit-core';
import type { ResetOutput } from '@kb-labs/commit-contracts';

type ResetInput = {
  scope?: string;
};

type ResetResult = {
  exitCode: number;
  result?: ResetOutput;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'commit:reset',
  description: 'Clear current commit plan',

  handler: {
    async execute(ctx: PluginContextV3, input: ResetInput): Promise<ResetResult> {
      const startTime = Date.now();
      const cwd = (await findRepoRoot(ctx.cwd || process.cwd())) ?? process.cwd();

      const scope = input.scope ?? 'root';

      // Check if plan exists
      const exists = await hasPlan(cwd, scope);

      if (!exists) {
        ctx.ui?.info?.('No commit plan to clear.');
        return {
          exitCode: 0,
          result: {
            success: true,
            message: 'No commit plan to clear.',
          },
          meta: {
            timing: Date.now() - startTime,
          },
        };
      }

      // Clear plan
      await clearPlan(cwd, scope);

      ctx.ui?.success?.('Plan Cleared', {
        sections: [{
          items: [
            'Status: ✅ Cleared successfully',
            'Action: Run `kb commit:generate` to create a new plan',
          ],
        }],
      });

      return {
        exitCode: 0,
        result: {
          success: true,
          message: 'Commit plan cleared successfully.',
        },
        meta: {
          timing: Date.now() - startTime,
        },
      };
    },
  },
});
