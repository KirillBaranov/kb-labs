/**
 * POST /run handler
 *
 * Runs QA checks (build, lint, types, tests) and optionally saves to history.
 */

import { defineHandler, useConfig, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { runQA, createHistoryEntry, appendEntry } from '@kb-labs/qa-core';
import type { QARunRequest, QARunResponse, QAPluginConfig } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, QARunRequest>,
  ): Promise<QARunResponse> {
    const rootDir = ctx.cwd;
    const startTime = Date.now();
    const body = input.body;

    let config: QAPluginConfig | undefined;
    try {
      config = await Promise.race([
        useConfig<QAPluginConfig>(),
        new Promise<undefined>((resolve) => { setTimeout(() => resolve(undefined), 3000); }),
      ]);
    } catch { /* no platform context */ }

    const checks = config?.checks;

    const { results } = await runQA({
      rootDir,
      skipChecks: body?.skipChecks,
      packagesConfig: config?.packages,
      checks,
    });

    // Determine overall status
    const hasFailed = Object.values(results).some((r) => r.failed.length > 0);
    const status = hasFailed ? 'failed' : 'passed';

    // Save to history unless explicitly disabled
    let entry = null;
    if (body?.saveToHistory !== false) {
      entry = createHistoryEntry(results, rootDir);
      appendEntry(rootDir, entry);
    }

    const durationMs = Date.now() - startTime;

    // Track analytics events
    const analytics = ctx.platform.analytics;
    if (analytics) {
      for (const ct of Object.keys(results)) {
        const r = results[ct]!;
        await analytics.track('qa.check.completed', {
          checkType: ct,
          status: r.failed.length > 0 ? 'failed' : 'passed',
          passed: r.passed.length,
          failed: r.failed.length,
          skipped: r.skipped.length,
          gitCommit: entry?.git.commit, gitBranch: entry?.git.branch,
        });
      }
      const checkKeys = Object.keys(results);
      await analytics.track('qa.run.completed', {
        status,
        ...Object.fromEntries(checkKeys.flatMap((ct) => [
          [`${ct}Passed`, results[ct]!.passed.length],
          [`${ct}Failed`, results[ct]!.failed.length],
        ])),
        totalPassed: checkKeys.reduce((s, ct) => s + results[ct]!.passed.length, 0),
        totalFailed: checkKeys.reduce((s, ct) => s + results[ct]!.failed.length, 0),
        totalSkipped: checkKeys.reduce((s, ct) => s + results[ct]!.skipped.length, 0),
        gitCommit: entry?.git.commit, gitBranch: entry?.git.branch,
        durationMs,
      });
    }

    return {
      status,
      results,
      entry,
      durationMs,
    };
  },
});
