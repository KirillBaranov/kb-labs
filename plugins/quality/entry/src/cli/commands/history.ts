import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import { QualitySnapshotStore } from '@kb-labs/quality-core';
import { defaultQualityConfig, type QualityPluginConfig } from '@kb-labs/quality-contracts';
import type { HistoryFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<HistoryFlags>, unknown>({
  id: 'quality:history',
  description: 'Show quality snapshot history and trends',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<HistoryFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QualityPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const store = new QualitySnapshotStore(cwd, config?.maxSnapshots ?? defaultQualityConfig.maxSnapshots);
      const { snapshots, delta, latest } = store.history();

      if (snapshots.length === 0) {
        ctx.ui?.success?.('No snapshots yet. Run `kb quality snapshot` first.');
        return { ok: true };
      }

      const limit = flags.limit ?? 10;
      const recent = snapshots.slice(-limit).reverse();

      if (flags.json) {
        ctx.ui?.json?.({ snapshots: recent, delta, latest });
        return { ok: true };
      }

      const items = recent.map(s => {
        const date = new Date(s.timestamp).toLocaleString();
        const branch = s.git.branch ? ` [${s.git.branch}]` : '';
        return `${date}${branch} — ${s.score}/100 (${s.grade})  violations: ${s.counters.layeringViolations}  any: ${s.counters.anyCount}`;
      });

      const sections: Array<{ header: string; items: string[] }> = [
        { header: `Last ${recent.length} snapshots`, items },
      ];

      if (delta) {
        const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
        sections.push({
          header: 'Delta vs previous snapshot',
          items: [
            `Score: ${sign(delta.score)}`,
            `Layering violations: ${sign(delta.layeringViolations)}`,
            `Any count: ${sign(delta.anyCount)}`,
            `Unused files: ${sign(delta.unusedFiles)}`,
            `Avg instability: ${sign(delta.avgInstability)}`,
          ],
        });
      }

      ctx.ui?.success?.(`Quality history (${recent.length} snapshots)`, { sections });
      return { ok: true };
    },
  },
});
