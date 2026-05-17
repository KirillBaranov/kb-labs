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
  buildStatsReport,
  buildStatsJsonReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaStatsFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaStatsFlags>, { exitCode: number }>({
  id: 'qa:stats',
  description: 'Show devkit health score and category breakdown',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaStatsFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const binaryPath = resolveDevkitBin(cwd, config?.devkitPath);
      const adapter = new DevkitAdapter({ binaryPath, cwd, shell: ctx.api.shell });
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);

      const save = flags.save !== false;
      const git = await captureGit(ctx.api.shell, cwd);

      const start = Date.now();
      const raw = await adapter.stats();
      const durationMs = Date.now() - start;

      const snap = save ? store.saveStats(raw, durationMs, git) : null;
      const effective: import('@kb-labs/qa-contracts').StatsSnapshot = snap ?? {
        kind: 'stats', id: '', timestamp: new Date().toISOString(), durationMs, raw,
      };

      if (flags.json) {
        ctx.ui?.json?.(buildStatsJsonReport(effective));
      } else {
        for (const section of buildStatsReport(effective)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: 0 };
    },
  },
});
