/**
 * GET /summary handler
 *
 * Aggregated QA overview: per-check pass rates, baseline info, last run status.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadBaseline, loadHistory } from '@kb-labs/qa-core';
import { getCheckLabel, getCheckIcon } from '@kb-labs/qa-contracts';
import type { QASummaryRequest, QASummaryResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QASummaryRequest, unknown>,
  ): Promise<QASummaryResponse> {
    const baseline = loadBaseline(ctx.cwd);
    const history = loadHistory(ctx.cwd);
    const latest = history.length > 0 ? history[history.length - 1] : null;

    const checkKeys = latest ? Object.keys(latest.summary) : [];
    const checks = checkKeys.map((ct) => ({
      checkType: ct,
      label: getCheckLabel(ct),
      icon: getCheckIcon(ct),
      passed: latest?.summary[ct]?.passed ?? 0,
      failed: latest?.summary[ct]?.failed ?? 0,
      skipped: latest?.summary[ct]?.skipped ?? 0,
      total:
        (latest?.summary[ct]?.passed ?? 0) +
        (latest?.summary[ct]?.failed ?? 0) +
        (latest?.summary[ct]?.skipped ?? 0),
    }));

    return {
      status: latest?.status ?? 'unknown',
      lastRunAt: latest?.timestamp ?? null,
      git: latest?.git ?? null,
      checks,
      hasBaseline: baseline !== null,
      baselineTimestamp: baseline?.timestamp ?? null,
      historyCount: history.length,
    };
  },
});
