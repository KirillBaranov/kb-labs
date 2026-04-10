/**
 * Run pre-release checks handler — thin adapter over core runReleaseChecks().
 */

import { defineHandler, findRepoRoot, type RestInput, useConfig } from '@kb-labs/sdk';
import type { RunChecksRequest, RunChecksResponse, CheckResultItem } from '@kb-labs/release-manager-contracts';
import { runReleaseChecks, type ReleaseConfig, type CustomCheckConfig } from '@kb-labs/release-manager-core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scopeToDir } from '../../shared/utils.js';
import { resolveScopePath } from '@kb-labs/release-manager-core';

export default defineHandler({
  async execute(ctx, input: RestInput<unknown, RunChecksRequest>): Promise<RunChecksResponse> {
    const scope = input.body?.scope ?? 'root';
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);
    const scopeCwd = await resolveScopePath(repoRoot, scope);
    const startTime = Date.now();

    const config = await useConfig<ReleaseConfig>();
    const checks: CustomCheckConfig[] = config?.scopes?.[scope]?.checks ?? config?.checks ?? [];

    if (checks.length === 0) {
      return { scope, success: true, checks: [], totalDurationMs: Date.now() - startTime };
    }

    // Read plan to get package paths
    const scopeDir = scopeToDir(scope);
    const planPath = join(repoRoot, '.kb/release/plans', scopeDir, 'current', 'plan.json');
    let packagePaths: string[] = [];
    try {
      const plan: { packages: Array<{ name: string; path: string }> } = JSON.parse(await readFile(planPath, 'utf-8'));
      packagePaths = plan.packages.map(pkg => pkg.path.startsWith('/') ? pkg.path : join(repoRoot, pkg.path));
    } catch {
      packagePaths = [scopeCwd];
    }

    // Run checks via core
    const results = await runReleaseChecks(checks, {
      repoRoot,
      packagePaths,
      scopePath: scopeCwd,
      logger: ctx.platform?.logger,
    });

    const allPassed = results.every(r => r.ok || r.hint === 'optional');

    // Map core CheckResult to REST CheckResultItem
    const checkItems: CheckResultItem[] = results.map(r => ({
      id: r.id,
      name: checks.find(c => c.id === r.id)?.name ?? r.id,
      success: r.ok,
      error: r.details && typeof r.details === 'object' && 'error' in r.details ? String((r.details as any).error) : undefined,
      durationMs: r.timingMs ?? 0,
      optional: checks.find(c => c.id === r.id)?.optional,
    }));

    return {
      scope,
      success: allPassed,
      checks: checkItems,
      totalDurationMs: Date.now() - startTime,
    };
  },
});
