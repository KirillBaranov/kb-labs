import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  compareWithBaseline,
  buildBaselineDiffReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { BaselineDiffFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<BaselineDiffFlags>, { exitCode: number }>({
  id: 'qa:baseline:diff',
  description: 'Diff current state against baseline',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BaselineDiffFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const baseline = store.loadBaseline();

      if (!baseline) {
        ctx.ui?.error?.('No baseline found. Run `qa baseline update` first.');
        return { exitCode: 1 };
      }

      const latestCheck = store.latestCheck();
      const latestStats = store.latestStats();

      if (!latestCheck || !latestStats) {
        ctx.ui?.error?.('No check/stats snapshots found. Run `qa check` and `qa stats` first.');
        return { exitCode: 1 };
      }

      const diff = compareWithBaseline(latestCheck.raw, latestStats.raw, baseline);

      if (flags.json) {
        ctx.ui?.json?.(diff);
      } else {
        for (const section of buildBaselineDiffReport(diff)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: diff.newIssueCount > 0 ? 1 : 0 };
    },
  },
});
