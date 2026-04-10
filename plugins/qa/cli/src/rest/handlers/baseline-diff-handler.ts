/**
 * GET /baseline/diff handler
 *
 * Compares current QA state (from last run) with saved baseline.
 * Shows new failures, fixed packages, and still-failing.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadBaseline, loadLastRun, compareWithBaseline } from '@kb-labs/qa-core';
import type { QABaselineDiffRequest, QABaselineDiffResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QABaselineDiffRequest, unknown>,
  ): Promise<QABaselineDiffResponse> {
    const rootDir = ctx.cwd;

    const baseline = loadBaseline(rootDir);
    const lastRun = loadLastRun(rootDir);

    // No baseline or no last run — return empty diff
    if (!baseline || !lastRun) {
      return {
        hasDiff: false,
        diff: {} as QABaselineDiffResponse['diff'],
        baseline: baseline ?? null,
        current: lastRun ? {
          timestamp: lastRun.timestamp,
          summary: buildSummaryFromResults(lastRun.results),
        } : null,
      };
    }

    const diff = compareWithBaseline(lastRun.results, baseline);

    // Check if there's any actual diff
    const hasDiff = Object.keys(diff).some((ct) => {
      const d = diff[ct]!;
      return d.newFailures.length > 0 || d.fixed.length > 0;
    });

    return {
      hasDiff,
      diff,
      baseline,
      current: {
        timestamp: lastRun.timestamp,
        summary: buildSummaryFromResults(lastRun.results),
      },
    };
  },
});

function buildSummaryFromResults(
  results: Record<string, { passed: string[]; failed: string[] }>,
): Record<string, { passed: number; failed: number }> {
  const summary: Record<string, { passed: number; failed: number }> = {};
  for (const ct of Object.keys(results)) {
    const r = results[ct];
    summary[ct] = {
      passed: r?.passed.length ?? 0,
      failed: r?.failed.length ?? 0,
    };
  }
  return summary;
}
