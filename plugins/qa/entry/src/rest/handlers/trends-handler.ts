/**
 * GET /trends handler
 *
 * Analyzes QA quality trends over a sliding window.
 * Supports ?window=N and ?enriched=true for full time-series + changelog.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadHistory, analyzeTrends, analyzeEnrichedTrends } from '@kb-labs/qa-core';
import { TRENDS_WINDOW } from '@kb-labs/qa-contracts';
import type { QATrendsResponse, QAEnrichedTrendsResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<Record<string, string>, unknown>,
  ): Promise<QATrendsResponse | QAEnrichedTrendsResponse> {
    const window = input.query?.window ? Number(input.query.window) : TRENDS_WINDOW;
    const enriched = String(input.query?.enriched) === 'true';
    const history = loadHistory(ctx.cwd);

    if (enriched) {
      const trends = analyzeEnrichedTrends(history, window);
      return {
        trends,
        historyCount: history.length,
        window,
      };
    }

    const trends = analyzeTrends(history, window);
    return {
      trends,
      historyCount: history.length,
      window,
    };
  },
});
