/**
 * GET /history handler
 *
 * Returns QA run history, newest first. Supports ?limit=N.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadHistory } from '@kb-labs/qa-core';
import type { QAHistoryRequest, QAHistoryResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<QAHistoryRequest, unknown>,
  ): Promise<QAHistoryResponse> {
    const limit = input.query?.limit;
    const allEntries = loadHistory(ctx.cwd);

    // Return newest first
    let entries = [...allEntries].reverse();
    if (limit && limit > 0) {
      entries = entries.slice(0, limit);
    }

    return {
      entries,
      total: allEntries.length,
    };
  },
});
