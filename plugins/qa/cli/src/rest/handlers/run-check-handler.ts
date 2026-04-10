/**
 * POST /run/check handler
 *
 * Runs a single check type (lint, typeCheck, or test) with optional filtering
 * by repo or package name. Useful for quick re-checks from the UI.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { getWorkspacePackages, runLintCheck, runTypeCheck, runTestCheck } from '@kb-labs/qa-core';
import type { QARunCheckRequest, QARunCheckResponse } from '@kb-labs/qa-contracts';
import type { CheckResult } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, QARunCheckRequest>,
  ): Promise<QARunCheckResponse> {
    const rootDir = ctx.cwd;
    const startTime = Date.now();
    const body = input.body!;

    const { checkType, repo, package: packageFilter } = body;

    // Discover workspace packages
    let packages = getWorkspacePackages(rootDir);

    // Filter by repo if specified
    if (repo) {
      packages = packages.filter((p) => p.repo === repo);
    }

    // Filter by package name if specified
    if (packageFilter) {
      packages = packages.filter((p) => p.name === packageFilter || p.name.includes(packageFilter));
    }

    // Run the specified check
    let result: CheckResult;
    switch (checkType) {
      case 'lint':
        result = runLintCheck({ rootDir, packages });
        break;
      case 'typeCheck':
        result = runTypeCheck({ rootDir, packages });
        break;
      case 'test':
        result = runTestCheck({ rootDir, packages });
        break;
      default:
        result = { passed: [], failed: [], skipped: [], errors: {} };
    }

    const hasFailed = result.failed.length > 0;
    const durationMs = Date.now() - startTime;

    // Track analytics event
    const analytics = ctx.platform.analytics;
    if (analytics) {
      await analytics.track('qa.check.completed', {
        checkType,
        status: hasFailed ? 'failed' : 'passed',
        passed: result.passed.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
        durationMs,
        repo: repo || undefined,
        package: packageFilter || undefined,
      });
    }

    return {
      checkType,
      status: hasFailed ? 'failed' : 'passed',
      result,
      durationMs,
    };
  },
});
