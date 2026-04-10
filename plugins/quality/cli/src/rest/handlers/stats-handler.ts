/**
 * POST /stats handler
 *
 * Get monorepo statistics: packages, LOC, size, health score.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { calculateStats } from '@kb-labs/quality-core/stats';
import { calculateHealth } from '@kb-labs/quality-core/health';

export type StatsRequest = {
  includeHealth?: boolean;
};

export type StatsResponse = {
  packages: number;
  loc: number;
  size: string;
  health?: number;
  grade?: string;
};

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<StatsRequest, unknown>
  ): Promise<StatsResponse> {
    const includeHealth = input.query?.includeHealth ?? false;

    // Calculate stats
    const stats = await calculateStats(ctx.cwd);

    // Optionally calculate health
    let health: number | undefined;
    let grade: string | undefined;

    if (includeHealth) {
      const healthResult = await calculateHealth(ctx.cwd);
      health = healthResult.score;
      grade = healthResult.grade;
    }

    return {
      packages: stats.packages,
      loc: stats.loc,
      size: stats.sizeFormatted,
      health,
      grade,
    };
  },
});
