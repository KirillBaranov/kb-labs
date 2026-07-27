import {
  defineCommand,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import { calculateStats } from '@kb-labs/quality-core';
import type { StatsFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<StatsFlags>, unknown>({
  id: 'quality:stats',
  description: 'Monorepo statistics: packages, lines of code, size',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<StatsFlags>): Promise<CommandResult> {
      const { flags } = input;
      const cwd = ctx.cwd ?? process.cwd();

      const stats = await calculateStats(cwd);

      if (flags.json) {
        ctx.ui?.json?.(stats);
        return { ok: true };
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

      return { ok: true };
    },
  },
});
