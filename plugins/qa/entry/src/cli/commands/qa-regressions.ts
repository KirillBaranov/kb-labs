import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  SnapshotStore,
  detectRegressions,
  buildRegressionsReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaRegressionsFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaRegressionsFlags>, { exitCode: number }>({
  id: 'qa:regressions',
  description: 'Detect regressions since last run',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaRegressionsFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new SnapshotStore(cwd, config?.historyMaxEntries);
      const history = store.loadRunHistory();
      const detection = detectRegressions(history);

      if (flags.json) {
        ctx.ui?.json?.(detection);
      } else {
        for (const section of buildRegressionsReport(detection)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: detection.hasRegressions ? 1 : 0 };
    },
  },
});
