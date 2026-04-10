/**
 * GET /latest handler
 *
 * Returns the most recent QA run from history.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadHistory } from '@kb-labs/qa-core';
import type { QALatestRequest, QALatestResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QALatestRequest, unknown>,
  ): Promise<QALatestResponse> {
    const history = loadHistory(ctx.cwd);

    if (history.length === 0) {
      return { entry: null };
    }

    return { entry: history[history.length - 1]! };
  },
});
