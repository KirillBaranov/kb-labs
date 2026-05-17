import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  buildHistoryTable,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaHistoryFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaHistoryFlags>, { exitCode: number }>({
  id: 'qa:history',
  description: 'Show QA run history',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaHistoryFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const limit = flags.limit ?? 20;
      const history = store.loadRunHistory();

      if (flags.json) {
        ctx.ui?.json?.([...history].reverse().slice(0, limit));
      } else {
        for (const section of buildHistoryTable(history, limit)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: 0 };
    },
  },
});
