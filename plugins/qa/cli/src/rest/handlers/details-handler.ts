/**
 * GET /details handler
 *
 * Returns per-package details with error text from the last QA run.
 * Data comes from last-run.json (saved by qa-orchestrator after each run).
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { loadLastRun } from '@kb-labs/qa-core';
import type { QADetailsRequest, QADetailsResponse } from '@kb-labs/qa-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput<QADetailsRequest, unknown>,
  ): Promise<QADetailsResponse> {
    const lastRun = loadLastRun(ctx.cwd);

    if (!lastRun) {
      // No last run data — return empty structure
      return {
        timestamp: null,
        git: null,
        checks: {} as QADetailsResponse['checks'],
      };
    }

    const { results, packages, submodules, timestamp } = lastRun;

    // Build a lookup: package name → package metadata
    const pkgMap = new Map(packages.map((p) => [p.name, p]));

    // Get git info from the latest history entry (last-run doesn't store git directly)
    // We'll use execSync to get current git info as a fallback
    let git: QADetailsResponse['git'] = null;
    try {
      const { execSync } = await import('node:child_process');
      const commit = execSync('git rev-parse --short HEAD', { cwd: ctx.cwd, encoding: 'utf-8' }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ctx.cwd, encoding: 'utf-8' }).trim();
      const message = execSync('git log -1 --format=%s', { cwd: ctx.cwd, encoding: 'utf-8' }).trim();
      git = { commit, branch, message };
    } catch {
      // git not available
    }

    const checks: QADetailsResponse['checks'] = {} as QADetailsResponse['checks'];

    for (const ct of Object.keys(results)) {
      const checkResult = results[ct]!;
      const passed = checkResult.passed.map((name) => {
        const pkg = pkgMap.get(name);
        return {
          name,
          repo: pkg?.repo ?? 'unknown',
          status: 'passed' as const,
          submodule: pkg?.submodule,
        };
      });
      const failed = checkResult.failed.map((name) => {
        const pkg = pkgMap.get(name);
        return {
          name,
          repo: pkg?.repo ?? 'unknown',
          status: 'failed' as const,
          error: checkResult.errors[name],
          submodule: pkg?.submodule,
        };
      });
      const skipped = checkResult.skipped.map((name) => {
        const pkg = pkgMap.get(name);
        return {
          name,
          repo: pkg?.repo ?? 'unknown',
          status: 'skipped' as const,
          submodule: pkg?.submodule,
        };
      });

      checks[ct] = { passed, failed, skipped };
    }

    return {
      timestamp,
      git,
      submodules,
      checks,
    };
  },
});
