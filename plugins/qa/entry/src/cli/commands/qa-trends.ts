import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  analyzeTrends,
  buildTrendsReport,
} from '@kb-labs/qa-core';
import { TRENDS_WINDOW, type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaTrendsFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaTrendsFlags>, { exitCode: number }>({
  id: 'qa:trends',
  description: 'Show QA quality trends over time',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaTrendsFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const window = flags.window ?? TRENDS_WINDOW;
      const history = store.loadRunHistory();
      const analysis = analyzeTrends(history, window);

      if (flags.json) {
        ctx.ui?.json?.(analysis);
      } else {
        for (const section of buildTrendsReport(analysis)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: 0 };
    },
  },
});
