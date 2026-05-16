import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadHistory, analyzeTrends, analyzeEnrichedTrends, buildTrendsReport } from '@kb-labs/qa-core';
import type { QATrendsFlags } from './flags.js';

type QATrendsInput = QATrendsFlags & { argv?: string[] };

export default defineCommand({
  id: 'qa:trends',
  description: 'Show QA quality trends over time',

  handler: {
    async execute(ctx: PluginContextV3, input: QATrendsInput) {
      const { ui } = ctx;
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: QATrendsInput }).flags
        : input;
      const rootDir = ctx.cwd;

      const history = loadHistory(rootDir);
      const window = typeof flags.window === 'number' ? flags.window : 10;
      const trends = analyzeTrends(history, window);

      if (flags.json) {
        const enrichedTrends = analyzeEnrichedTrends(history, window);
        ui?.json?.({ trends: enrichedTrends, historyCount: history.length, window });
        return { exitCode: 0 };
      }

      const sections = buildTrendsReport(trends, history);
      if (sections.length > 0) {
        ui?.success?.(sections[0]!.header, {
          sections: sections.map(s => ({ header: s.header, items: s.lines })),
        });
      }

      return { exitCode: 0 };
    },
  },
});
