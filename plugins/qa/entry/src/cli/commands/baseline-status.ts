import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadBaseline, buildBaselineReport } from '@kb-labs/qa-core';
import type { BaselineStatusFlags } from './flags.js';

type BaselineStatusInput = BaselineStatusFlags & { argv?: string[] };

export default defineCommand({
  id: 'baseline:status',
  description: 'Show current baseline status',

  handler: {
    async execute(ctx: PluginContextV3, input: BaselineStatusInput) {
      const { ui } = ctx;
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: BaselineStatusInput }).flags
        : input;
      const rootDir = ctx.cwd;

      const baseline = loadBaseline(rootDir);

      if (flags.json) {
        ui?.json?.(baseline ?? { status: 'no-baseline' });
        return { exitCode: 0 };
      }

      const sections = buildBaselineReport(baseline);
      if (sections.length > 0) {
        ui?.success?.(sections[0]!.header, {
          sections: sections.map(s => ({ header: s.header, items: s.lines })),
        });
      }

      return { exitCode: 0 };
    },
  },
});
