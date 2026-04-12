import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { loadHistory, detectRegressions, buildRegressionsReport } from '@kb-labs/qa-core';
import type { QARegressionsFlags } from './flags.js';

type QARegressionsInput = QARegressionsFlags & { argv?: string[]; flags?: any };

export default defineCommand({
  id: 'qa:regressions',
  description: 'Detect regressions since last QA save',

  handler: {
    async execute(ctx: PluginContextV3, input: QARegressionsInput) {
      const { ui } = ctx;
      const flags = (input as any).flags ?? input;
      const rootDir = ctx.cwd;

      const history = loadHistory(rootDir);
      const result = detectRegressions(history);

      if (flags.json) {
        ui?.json?.(result);
        return { exitCode: result.hasRegressions ? 1 : 0 };
      }

      const sections = buildRegressionsReport(result, history);
      for (const section of sections) {
        ui?.success?.(section.header, {
          title: section.header,
          sections: [{ header: '', items: section.lines }],
        });
      }

      return { exitCode: result.hasRegressions ? 1 : 0 };
    },
  },
});
