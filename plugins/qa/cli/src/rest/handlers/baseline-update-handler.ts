/**
 * POST /baseline/update handler
 *
 * Creates a new baseline from the last QA run results.
 * Does NOT re-run QA — uses stored last-run data.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadLastRun, createBaselineFromResults, saveBaseline } from '@kb-labs/qa-core';
import type { QABaselineUpdateRequest, QABaselineUpdateResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<unknown, QABaselineUpdateRequest>,
  ): Promise<QABaselineUpdateResponse> {
    const rootDir = ctx.cwd;

    const lastRun = loadLastRun(rootDir);
    if (!lastRun) {
      throw new Error('No last run data available. Run QA first (POST /run).');
    }

    const baseline = createBaselineFromResults(lastRun.results, rootDir);
    saveBaseline(rootDir, baseline);

    return {
      success: true,
      baseline,
    };
  },
});
