/**
 * GET /baseline handler
 *
 * Returns the current baseline snapshot.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadBaseline } from '@kb-labs/qa-core';
import type { QABaselineRequest, QABaselineResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QABaselineRequest, unknown>,
  ): Promise<QABaselineResponse> {
    const baseline = loadBaseline(ctx.cwd);
    return { baseline: baseline ?? null };
  },
});
