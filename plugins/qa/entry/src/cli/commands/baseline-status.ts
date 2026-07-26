import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  buildBaselineReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { BaselineStatusFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<BaselineStatusFlags>, unknown>({
  id: 'qa:baseline:status',
  description: 'Show current baseline',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BaselineStatusFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const baseline = store.loadBaseline();

      if (flags.json) {
        ctx.ui?.json?.(baseline);
      } else {
        for (const section of buildBaselineReport(baseline)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { ok: true };
    },
  },
});
