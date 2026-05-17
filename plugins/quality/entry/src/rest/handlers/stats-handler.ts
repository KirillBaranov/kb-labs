import { defineHandler, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { calculateStats } from '@kb-labs/quality-core/stats';

export default defineHandler({
  async execute(ctx: PluginContextV3, _input: RestInput<unknown, unknown>) {
    try {
      const stats = await calculateStats(ctx.cwd);
      return {
        packages: stats.packages,
        loc: stats.loc,
        size: stats.sizeFormatted,
      };
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
