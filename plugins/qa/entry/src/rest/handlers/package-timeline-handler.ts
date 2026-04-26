/**
 * GET /packages/:name/timeline handler
 *
 * Returns per-package QA timeline across history entries.
 * Computes flaky score, current streak, and first failure.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadHistory, getPackageTimeline } from '@kb-labs/qa-core';
import type { QAPackageTimelineRequest, QAPackageTimelineResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<QAPackageTimelineRequest, unknown>,
  ): Promise<QAPackageTimelineResponse> {
    const packageName = (input as RestInput<QAPackageTimelineRequest, unknown, { name?: string }>).params?.name;

    if (!packageName) {
      throw new Error('Package name is required (path param :name)');
    }

    const history = loadHistory(ctx.cwd);
    return getPackageTimeline(history, packageName);
  },
});
