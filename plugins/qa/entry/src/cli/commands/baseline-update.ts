import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  DevkitAdapter,
  SnapshotStore,
  resolveDevkitBin,
  captureGit,
  buildBaselineReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { BaselineUpdateFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<BaselineUpdateFlags>, { exitCode: number }>({
  id: 'qa:baseline:update',
  description: 'Run check + stats and save as new baseline',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<BaselineUpdateFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const binaryPath = resolveDevkitBin(cwd, config?.devkitPath);
      const adapter = new DevkitAdapter({ binaryPath, cwd, shell: ctx.api.shell });
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);

      const git = await captureGit(ctx.api.shell, cwd);

      const [check, stats] = await Promise.all([adapter.check(), adapter.stats()]);
      const baseline = store.saveBaseline(check, stats, git);

      if (flags.json) {
        ctx.ui?.json?.(baseline);
      } else {
        for (const section of buildBaselineReport(baseline)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: 0 };
    },
  },
});
