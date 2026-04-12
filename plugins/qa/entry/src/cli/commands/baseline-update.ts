import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { captureBaseline, buildBaselineReport } from '@kb-labs/qa-core';
import type { BaselineUpdateFlags } from './flags.js';

type BaselineUpdateInput = BaselineUpdateFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'baseline:update',
  description: 'Run full QA and save as new baseline',

  handler: {
    async execute(ctx: PluginContextV3, input: BaselineUpdateInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      const snapshot = await captureBaseline(rootDir);

      if (flags.json) {
        ui?.json?.(snapshot);
        return { exitCode: 0 };
      }

      const sections = buildBaselineReport(snapshot);
      for (const section of sections) {
        ui?.success?.(section.header, {
          title: section.header,
          sections: [{ header: '', items: section.lines }],
        });
      }

      ui?.success?.('Baseline captured successfully', {});
      return { exitCode: 0 };
    },
  },
});
