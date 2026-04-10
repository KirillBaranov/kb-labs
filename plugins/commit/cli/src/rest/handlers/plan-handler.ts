import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadPlan } from '@kb-labs/commit-core/storage';
import type { PlanResponse } from '@kb-labs/commit-contracts';

/**
 * GET /plan handler
 *
 * Returns the current commit plan for Studio.
 */
export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput<{ scope?: string }, unknown>): Promise<PlanResponse> {
    const scope = input.query?.scope || 'root';

    try {
      const plan = await loadPlan(ctx.cwd, scope);

      if (!plan || plan.commits.length === 0) {
        return {
          hasPlan: false,
          scope,
        };
      }

      return {
        hasPlan: true,
        plan,
        scope,
      };
    } catch (error) {
      return {
        hasPlan: false,
        scope,
      };
    }
  },
});
