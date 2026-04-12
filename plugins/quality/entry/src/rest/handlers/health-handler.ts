/**
 * POST /health handler
 *
 * Get monorepo health score and grade (A-F).
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { calculateHealth, type HealthIssue } from '@kb-labs/quality-core/health';

export type HealthRequest = {
  detailed?: boolean;
};

export type HealthResponse = {
  score: number;
  grade: string;
  issues?: HealthIssue[];
};

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<HealthRequest, unknown>
  ): Promise<HealthResponse> {
    const { detailed } = input.query ?? {};

    const healthResult = await calculateHealth(ctx.cwd);

    return {
      score: healthResult.score,
      grade: healthResult.grade,
      issues: detailed ? healthResult.issues : undefined,
    };
  },
});
