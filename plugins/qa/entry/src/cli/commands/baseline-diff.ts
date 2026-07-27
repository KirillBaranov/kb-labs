import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  compareWithBaseline,
  buildBaselineDiffReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { BaselineDiffFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<BaselineDiffFlags>, unknown>({
  id: 'qa:baseline:diff',
  description: 'Diff current state against baseline',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BaselineDiffFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const baseline = store.loadBaseline();

      if (!baseline) {
        ctx.ui?.error?.('No baseline found. Run `qa baseline update` first.');
        return { ok: false, error: 'Command failed' };
      }

      const latestCheck = store.latestCheck();
      const latestStats = store.latestStats();

      if (!latestCheck || !latestStats) {
        ctx.ui?.error?.('No check/stats snapshots found. Run `qa check` and `qa stats` first.');
        return { ok: false, error: 'Command failed' };
      }

      const diff = compareWithBaseline(latestCheck.raw, latestStats.raw, baseline);

      if (flags.json) {
        ctx.ui?.json?.(diff);
      } else {
        for (const section of buildBaselineDiffReport(diff)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return diff.newIssueCount > 0
        ? { ok: false, error: 'New issues found', result: diff }
        : { ok: true, result: diff };
    },
  },
});
