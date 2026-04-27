import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadHistory, buildHistoryTable } from '@kb-labs/qa-core';
import type { QAHistoryFlags } from './flags.js';

type QAHistoryInput = QAHistoryFlags & { argv?: string[] };

export default defineCommand({
  id: 'qa:history',
  description: 'Show QA run history',

  handler: {
    async execute(ctx: PluginContextV3, input: QAHistoryInput) {
      const { ui } = ctx;
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: QAHistoryInput }).flags
        : input;
      const rootDir = ctx.cwd;

      const history = loadHistory(rootDir);

      if (history.length === 0) {
        if (flags.json) {
          ui?.json?.([]);
          return { exitCode: 0 };
        }
        ui?.success?.('No QA history found. Run qa:save first.', {});
        return { exitCode: 0 };
      }

      const limit = typeof flags.limit === 'number' ? flags.limit : 20;

      if (flags.json) {
        ui?.json?.(history.slice(-limit));
        return { exitCode: 0 };
      }

      const sections = buildHistoryTable(history, limit);
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
