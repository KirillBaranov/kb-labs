/**
 * GET /regressions handler
 *
 * Detects regressions by comparing the last two history entries.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadHistory, detectRegressions } from '@kb-labs/qa-core';
import type { QARegressionsRequest, QARegressionsResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QARegressionsRequest, unknown>,
  ): Promise<QARegressionsResponse> {
    const history = loadHistory(ctx.cwd);
    return detectRegressions(history);
  },
});
