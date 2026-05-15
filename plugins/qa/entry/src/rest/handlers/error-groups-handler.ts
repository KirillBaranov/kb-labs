/**
 * GET /errors/groups handler
 *
 * Groups errors from the last QA run by pattern (ESLint rule, TS code, etc.).
 * Helps identify the most impactful errors to fix first.
 */

import { defineHandler, rethrowForRest, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadLastRun, groupErrors } from '@kb-labs/qa-core';
import type { QAErrorGroupsRequest, QAErrorGroupsResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QAErrorGroupsRequest, unknown>,
  ): Promise<QAErrorGroupsResponse> {
    try {
      const lastRun = loadLastRun(ctx.cwd);

      if (!lastRun) {
        return { groups: [], ungrouped: 0 };
      }

      return groupErrors(lastRun.results);
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
