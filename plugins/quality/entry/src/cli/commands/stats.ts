import {
  defineCommand,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import { calculateStats } from '@kb-labs/quality-core';
import type { StatsFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<StatsFlags>, { exitCode: number }>({
  id: 'quality:stats',
  description: 'Monorepo statistics: packages, lines of code, size',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<StatsFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const cwd = ctx.cwd ?? process.cwd();

      const stats = await calculateStats(cwd);

      if (flags.json) {
        ctx.ui?.json?.(stats);
        return { exitCode: 0 };
      }

      ctx.ui?.success?.('Monorepo statistics', {
        sections: [{
          header: 'Overview',
          items: [
            `Packages: ${stats.packages}`,
            `Lines of code: ${stats.loc.toLocaleString()}`,
            `Size: ${stats.sizeFormatted}`,
          ],
        }],
      });

      return { exitCode: 0 };
    },
  },
});
