import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadBaseline, buildBaselineReport } from '@kb-labs/qa-core';
import type { BaselineStatusFlags } from './flags.js';

type BaselineStatusInput = BaselineStatusFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'baseline:status',
  description: 'Show current baseline status',

  handler: {
    async execute(ctx: PluginContextV3, input: BaselineStatusInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      const baseline = loadBaseline(rootDir);

      if (flags.json) {
        ui?.json?.(baseline ?? { status: 'no-baseline' });
        return { exitCode: 0 };
      }

      const sections = buildBaselineReport(baseline);
      for (const section of sections) {
        ui?.success?.(section.header, {
          title: section.header,
          sections: [{ header: '', items: section.lines }],
        });
      }

      return { exitCode: 0 };
    },
  },
});
