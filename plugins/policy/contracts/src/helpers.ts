import type { CheckReport, PolicyViolation, RepoCheckResult } from './types.js';

/**
 * A mapping from rule identifier to the total number of violations produced
 * by that rule across all inputs passed to {@link getViolationSummary}.
 *
 * Only rules that produced **at least one** violation appear as keys; rules
 * that passed cleanly are omitted so callers can use a simple
 * `Object.keys(summary).length === 0` emptiness check.
 *
 * @example
 * ```ts
 * const summary: ViolationSummary = { 'sdk-only-deps': 3, 'boundary-check': 1 };
 * ```
 */
export type ViolationSummary = Record<string, number>;

/**
 * Counts the number of violations per rule across a flat array of
 * {@link PolicyViolation} objects.
 *
 * @example
 * ```ts
 * import { getViolationSummary } from '@kb-labs/policy-contracts';
 *
 * const violations: PolicyViolation[] = [
 *   { rule: 'sdk-only-deps', severity: 'error',   message: 'pkg-a imports core' },
 *   { rule: 'boundary-check', severity: 'warning', message: 'pkg-b depends on plugins' },
 *   { rule: 'sdk-only-deps', severity: 'error',   message: 'pkg-c imports core' },
 * ];
 *
 * getViolationSummary(violations);
 * // → { 'sdk-only-deps': 2, 'boundary-check': 1 }
 * ```
 */
export function getViolationSummary(violations: PolicyViolation[]): ViolationSummary;

/**
 * Counts the number of violations per rule for a single
 * {@link RepoCheckResult}.
 *
 * @example
 * ```ts
 * import { getViolationSummary } from '@kb-labs/policy-contracts';
 *
 * getViolationSummary(repoResult);
 * // → { 'boundary-check': 3 }
 * ```
 */
export function getViolationSummary(result: RepoCheckResult): ViolationSummary;

/**
 * Counts the number of violations per rule across **all** repos in a
 * {@link CheckReport}, aggregating results from every
 * `report.repos[n].violations` array.
 *
 * @example
 * ```ts
 * import { getViolationSummary } from '@kb-labs/policy-contracts';
 *
 * getViolationSummary(report);
 * // → { 'sdk-only-deps': 5, 'no-rollback': 2 }
 * ```
 */
export function getViolationSummary(report: CheckReport): ViolationSummary;

export function getViolationSummary(
  input: PolicyViolation[] | RepoCheckResult | CheckReport,
): ViolationSummary {
  let violations: PolicyViolation[];

  if (Array.isArray(input)) {
    // Overload 1: flat PolicyViolation[]
    violations = input;
  } else if ('repos' in input) {
    // Overload 3: CheckReport — `repos` is unique to CheckReport; RepoCheckResult does not have it
    violations = (input as CheckReport).repos.flatMap((r) => r.violations);
  } else {
    // Overload 2: RepoCheckResult
    violations = (input as RepoCheckResult).violations;
  }

  const summary: ViolationSummary = {};
  for (const v of violations) {
    summary[v.rule] = (summary[v.rule] ?? 0) + 1;
  }
  return summary;
}


/**
 * Returns `true` when every repo in the report passed all policy rules
 * (i.e. `report.passed === true`), `false` otherwise.
 *
 * @example
 * ```ts
 * import { isPolicyPassing } from '@kb-labs/policy-contracts';
 *
 * if (!isPolicyPassing(report)) {
 *   process.exit(1);
 * }
 * ```
 */
export function isPolicyPassing(report: CheckReport): boolean {
  return report.passed;
}


/**
 * Merges multiple {@link CheckReport} objects into a single consolidated report.
 *
 * All `repos` arrays are concatenated in input order. The `summary` counters
 * (`total`, `passed`, `failed`, `violations`) are recomputed from the merged
 * repo list. The top-level `passed` flag is `true` only when the merged result
 * has **zero** violations.
 *
 * Repos that share the same `path` across different input reports are kept as
 * separate entries (concatenation, not deduplication). Callers who need
 * dedup-by-path can post-process the returned `repos` array.
 *
 * @example
 * ```ts
 * import { mergeViolations } from '@kb-labs/policy-contracts';
 *
 * const combined = mergeViolations([reportA, reportB]);
 * // combined.repos === [...reportA.repos, ...reportB.repos]
 * // combined.passed === (combined.summary.violations === 0)
 * ```
 */
export function mergeViolations(reports: CheckReport[]): CheckReport {
  const repos = reports.flatMap((r) => r.repos);
  const total = repos.length;
  const failed = repos.filter((r) => r.violations.length > 0).length;
  const passedRepos = total - failed;
  const violations = repos.reduce((acc, r) => acc + r.violations.length, 0);
  return {
    passed: violations === 0,
    repos,
    summary: { total, passed: passedRepos, failed, violations },
  };
}
