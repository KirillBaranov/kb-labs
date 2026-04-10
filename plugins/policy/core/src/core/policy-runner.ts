import type { CategoryResult, CheckReport, PolicyConfig, RepoCheckResult } from '@kb-labs/policy-contracts';
import { checkSdkOnlyDeps } from '../checks/sdk-only-deps.js';
import { checkBoundary } from '../checks/boundary-check.js';
import { checkApiCompat } from '../checks/api-compat-check.js';
import { checkNoRollback } from '../checks/no-rollback.js';

type CheckFn = (repoPath: string, config: PolicyConfig, workspaceRoot: string) => Promise<import('@kb-labs/policy-contracts').PolicyViolation[]>;

const RULE_CHECKS: Record<string, CheckFn> = {
  'sdk-only-deps': checkSdkOnlyDeps,
  'boundary-check': checkBoundary,
  'no-breaking-without-major': checkApiCompat,
  'no-rollback': checkNoRollback,
  'api-compat-check': checkApiCompat,
};

export async function runChecks(
  repos: CategoryResult[],
  config: PolicyConfig,
  workspaceRoot: string,
): Promise<CheckReport> {
  const repoResults: RepoCheckResult[] = [];

  for (const repo of repos) {
    const violations = [];
    const passed: string[] = [];
    const rulesToRun = repo.rules;

    for (const rule of rulesToRun) {
      const checkFn = RULE_CHECKS[rule];
      if (!checkFn) {
        // Unknown rule — skip with warning
        console.warn(`[policy] Unknown rule: ${rule} (skipping)`);
        continue;
      }

      // FIX 3 (CRITICAL): wrap each rule execution individually so that an
      // unexpected throw from one check does not abort the remaining rules or
      // prevent the report from being built for this (and subsequent) repos.
      let ruleViolations: import('@kb-labs/policy-contracts').PolicyViolation[];
      try {
        ruleViolations = await checkFn(repo.path, config, workspaceRoot);
      } catch (err) {
        console.warn(`[policy] Rule '${rule}' threw an unexpected error (skipping): ${(err as Error).message}`);
        continue;
      }

      if (ruleViolations.length === 0) {
        passed.push(rule);
      } else {
        violations.push(...ruleViolations.map((v) => ({ ...v, rule })));
      }
    }

    repoResults.push({
      path: repo.path,
      category: repo.category,
      violations,
      passed,
    });
  }

  const totalViolations = repoResults.reduce((sum, r) => sum + r.violations.length, 0);
  const failedRepos = repoResults.filter((r) => r.violations.length > 0).length;

  return {
    passed: totalViolations === 0,
    repos: repoResults,
    summary: {
      total: repos.length,
      passed: repos.length - failedRepos,
      failed: failedRepos,
      violations: totalViolations,
    },
  };
}
