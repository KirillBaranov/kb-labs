import { describe, expect, it } from 'vitest';
import { mergeViolations } from '../src/helpers.js';
import type { CheckReport, PolicyViolation, RepoCheckResult } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const sdkError: PolicyViolation = {
  rule: 'sdk-only-deps',
  severity: 'error',
  message: 'pkg-a imports @kb-labs/core directly',
};

const sdkError2: PolicyViolation = {
  rule: 'sdk-only-deps',
  severity: 'error',
  message: 'pkg-d imports @kb-labs/core directly',
};

const boundaryWarn: PolicyViolation = {
  rule: 'boundary-check',
  severity: 'warning',
  message: 'pkg-b depends on pkg-c (category: plugins)',
};

const rollbackError: PolicyViolation = {
  rule: 'no-rollback',
  severity: 'error',
  message: 'version rolled back from 1.2.0 to 1.1.0',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(
  path: string,
  violations: PolicyViolation[],
  passed: string[] = [],
): RepoCheckResult {
  return { path, category: 'platform', violations, passed };
}

/**
 * Builds a consistent CheckReport from a repos array so each test's input
 * report already has correct summary values (mirrors the behaviour that a real
 * policy-runner would produce before handing reports to mergeViolations).
 */
function makeReport(repos: RepoCheckResult[]): CheckReport {
  const violations = repos.reduce((acc, r) => acc + r.violations.length, 0);
  const failed = repos.filter((r) => r.violations.length > 0).length;
  return {
    passed: violations === 0,
    repos,
    summary: { total: repos.length, passed: repos.length - failed, failed, violations },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeViolations', () => {
  // ── Edge: empty input ────────────────────────────────────────────────────

  it('returns a clean zeroed report for an empty array', () => {
    const result = mergeViolations([]);
    expect(result.passed).toBe(true);
    expect(result.repos).toEqual([]);
    expect(result.summary).toEqual({ total: 0, passed: 0, failed: 0, violations: 0 });
  });

  // ── Single report – clean ─────────────────────────────────────────────────

  it('passes through a single clean report unchanged', () => {
    const repo = makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps', 'boundary-check']);
    const report = makeReport([repo]);

    const result = mergeViolations([report]);

    expect(result.passed).toBe(true);
    expect(result.repos).toEqual([repo]);
    expect(result.summary).toEqual({ total: 1, passed: 1, failed: 0, violations: 0 });
  });

  // ── Single report – failing ───────────────────────────────────────────────

  it('passes through a single failing report and recomputes its summary correctly', () => {
    const repo = makeRepo('platform/kb-labs-core', [sdkError, boundaryWarn]);
    const report = makeReport([repo]);

    const result = mergeViolations([report]);

    expect(result.passed).toBe(false);
    expect(result.repos).toEqual([repo]);
    expect(result.summary).toEqual({ total: 1, passed: 0, failed: 1, violations: 2 });
  });

  // ── Two clean reports ─────────────────────────────────────────────────────

  it('merges two clean reports into one passing report', () => {
    const repoA = makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']);
    const repoB = makeRepo('plugins/kb-labs-agents', [], ['boundary-check']);
    const reportA = makeReport([repoA]);
    const reportB = makeReport([repoB]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.passed).toBe(true);
    expect(result.repos).toEqual([repoA, repoB]);
    expect(result.summary).toEqual({ total: 2, passed: 2, failed: 0, violations: 0 });
  });

  // ── One clean + one failing ───────────────────────────────────────────────

  it('sets passed:false when one of two reports has violations', () => {
    const cleanRepo = makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']);
    const failRepo = makeRepo('platform/kb-labs-core', [sdkError, rollbackError]);
    const reportA = makeReport([cleanRepo]);
    const reportB = makeReport([failRepo]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.passed).toBe(false);
    expect(result.repos).toEqual([cleanRepo, failRepo]);
    expect(result.summary).toEqual({ total: 2, passed: 1, failed: 1, violations: 2 });
  });

  // ── Two failing reports ───────────────────────────────────────────────────

  it('aggregates violations from two failing reports', () => {
    const repoA = makeRepo('platform/kb-labs-core', [sdkError, boundaryWarn]);
    const repoB = makeRepo('plugins/kb-labs-agents', [sdkError2, rollbackError]);
    const reportA = makeReport([repoA]);
    const reportB = makeReport([repoB]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.passed).toBe(false);
    expect(result.repos).toEqual([repoA, repoB]);
    expect(result.summary).toEqual({ total: 2, passed: 0, failed: 2, violations: 4 });
  });

  // ── Three reports — ordering ──────────────────────────────────────────────

  it('preserves repo order: report[0] repos first, then [1], then [2]', () => {
    const repoA = makeRepo('platform/kb-labs-sdk', []);
    const repoB = makeRepo('platform/kb-labs-core', [sdkError]);
    const repoC = makeRepo('plugins/kb-labs-agents', [boundaryWarn]);
    const reportA = makeReport([repoA]);
    const reportB = makeReport([repoB]);
    const reportC = makeReport([repoC]);

    const result = mergeViolations([reportA, reportB, reportC]);

    expect(result.repos[0]).toBe(repoA);
    expect(result.repos[1]).toBe(repoB);
    expect(result.repos[2]).toBe(repoC);
  });

  // ── summary.total ─────────────────────────────────────────────────────────

  it('summary.total equals the sum of all repo counts across input reports', () => {
    const reportA = makeReport([
      makeRepo('platform/a', []),
      makeRepo('platform/b', [sdkError]),
    ]);
    const reportB = makeReport([
      makeRepo('plugins/c', [boundaryWarn]),
      makeRepo('plugins/d', []),
      makeRepo('plugins/e', [rollbackError]),
    ]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.summary.total).toBe(5);
  });

  // ── summary.passed count vs top-level passed boolean ─────────────────────

  it('summary.passed (count) is distinct from the top-level passed (boolean)', () => {
    // Two repos: one clean, one failing — top-level passed must be false,
    // but summary.passed count must reflect the one clean repo.
    const cleanRepo = makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']);
    const failRepo = makeRepo('platform/kb-labs-core', [sdkError]);
    const report = makeReport([cleanRepo, failRepo]);

    const result = mergeViolations([report]);

    expect(result.passed).toBe(false);           // boolean — false because violations > 0
    expect(result.summary.passed).toBe(1);       // count  — one repo had zero violations
    expect(result.summary.failed).toBe(1);
    expect(result.summary.violations).toBe(1);
  });

  // ── Multiple repos per report ─────────────────────────────────────────────

  it('handles reports that each contain multiple repos', () => {
    const reportA = makeReport([
      makeRepo('platform/a', [sdkError]),
      makeRepo('platform/b', []),
    ]);
    const reportB = makeReport([
      makeRepo('plugins/c', [boundaryWarn, rollbackError]),
      makeRepo('plugins/d', []),
      makeRepo('plugins/e', [sdkError2]),
    ]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.summary.total).toBe(5);
    expect(result.summary.passed).toBe(2);   // platform/b and plugins/d
    expect(result.summary.failed).toBe(3);   // platform/a, plugins/c, plugins/e
    expect(result.summary.violations).toBe(4); // sdkError + boundaryWarn + rollbackError + sdkError2
    expect(result.passed).toBe(false);
  });

  // ── Immutability ──────────────────────────────────────────────────────────

  it('does not mutate the original reports\' repos arrays', () => {
    const repoA = makeRepo('platform/a', [sdkError]);
    const repoB = makeRepo('plugins/b', [boundaryWarn]);
    const reportA = makeReport([repoA]);
    const reportB = makeReport([repoB]);

    // Capture the original array references before the call.
    const originalReposA = reportA.repos;
    const originalReposB = reportB.repos;

    mergeViolations([reportA, reportB]);

    // The original arrays must be the same references and lengths.
    expect(reportA.repos).toBe(originalReposA);
    expect(reportA.repos).toHaveLength(1);
    expect(reportB.repos).toBe(originalReposB);
    expect(reportB.repos).toHaveLength(1);
  });

  // ── Repos with same path from different reports ───────────────────────────

  it('keeps duplicate-path repos as separate entries (no deduplication)', () => {
    // Both reports contain a result for the same repo path — both are kept.
    const repoFromRunA = makeRepo('platform/shared', [sdkError]);
    const repoFromRunB = makeRepo('platform/shared', [boundaryWarn]);
    const reportA = makeReport([repoFromRunA]);
    const reportB = makeReport([repoFromRunB]);

    const result = mergeViolations([reportA, reportB]);

    expect(result.repos).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.violations).toBe(2);
  });
});
