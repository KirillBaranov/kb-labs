import { describe, expect, it } from 'vitest';
import { getViolationSummary } from '../src/helpers.js';
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

const boundaryWarning: PolicyViolation = {
  rule: 'boundary-check',
  severity: 'warning',
  message: 'pkg-b depends on pkg-c (category: plugins)',
};

const rollbackError: PolicyViolation = {
  rule: 'no-rollback',
  severity: 'error',
  message: 'version rolled back from 1.2.0 to 1.1.0',
};

function makeRepo(
  path: string,
  violations: PolicyViolation[],
  passed: string[] = [],
): RepoCheckResult {
  return { path, category: 'platform', violations, passed };
}

// ---------------------------------------------------------------------------
// Tests: PolicyViolation[] overload
// ---------------------------------------------------------------------------

describe('getViolationSummary(PolicyViolation[])', () => {
  it('returns an empty object for an empty array', () => {
    expect(getViolationSummary([])).toEqual({});
  });

  it('counts a single violation', () => {
    expect(getViolationSummary([sdkError])).toEqual({ 'sdk-only-deps': 1 });
  });

  it('accumulates multiple violations for the same rule', () => {
    expect(getViolationSummary([sdkError, sdkError2])).toEqual({ 'sdk-only-deps': 2 });
  });

  it('counts distinct rules independently', () => {
    expect(getViolationSummary([sdkError, boundaryWarning, sdkError2])).toEqual({
      'sdk-only-deps': 2,
      'boundary-check': 1,
    });
  });

  it('handles three different rules', () => {
    expect(getViolationSummary([sdkError, boundaryWarning, rollbackError])).toEqual({
      'sdk-only-deps': 1,
      'boundary-check': 1,
      'no-rollback': 1,
    });
  });

  it('omits rules that are not present in the input', () => {
    const summary = getViolationSummary([sdkError]);
    expect(summary).not.toHaveProperty('boundary-check');
    expect(summary).not.toHaveProperty('no-rollback');
  });

  it('all values in the summary are positive integers', () => {
    const summary = getViolationSummary([sdkError, sdkError2, boundaryWarning]);
    for (const count of Object.values(summary)) {
      expect(count).toBeGreaterThan(0);
      expect(Number.isInteger(count)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: RepoCheckResult overload
// ---------------------------------------------------------------------------

describe('getViolationSummary(RepoCheckResult)', () => {
  it('returns an empty object when the repo has no violations', () => {
    const repo = makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']);
    expect(getViolationSummary(repo)).toEqual({});
  });

  it('counts violations from a single repo', () => {
    const repo = makeRepo('platform/kb-labs-core', [sdkError, boundaryWarning, sdkError2]);
    expect(getViolationSummary(repo)).toEqual({
      'sdk-only-deps': 2,
      'boundary-check': 1,
    });
  });

  it('ignores the passed[] list — only violations are counted', () => {
    const repo = makeRepo(
      'platform/kb-labs-core',
      [rollbackError],
      ['sdk-only-deps', 'boundary-check'],
    );
    const summary = getViolationSummary(repo);
    expect(summary).toEqual({ 'no-rollback': 1 });
    expect(summary).not.toHaveProperty('sdk-only-deps');
    expect(summary).not.toHaveProperty('boundary-check');
  });
});

// ---------------------------------------------------------------------------
// Tests: CheckReport overload
// ---------------------------------------------------------------------------

describe('getViolationSummary(CheckReport)', () => {
  it('returns an empty object when no repos have violations', () => {
    const report: CheckReport = {
      passed: true,
      repos: [
        makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']),
        makeRepo('plugins/kb-labs-agents', [], ['boundary-check']),
      ],
      summary: { total: 2, passed: 2, failed: 0, violations: 0 },
    };
    expect(getViolationSummary(report)).toEqual({});
  });

  it('aggregates violations across all repos', () => {
    const report: CheckReport = {
      passed: false,
      repos: [
        makeRepo('platform/kb-labs-core', [sdkError, boundaryWarning]),
        makeRepo('plugins/kb-labs-agents', [sdkError2, rollbackError]),
      ],
      summary: { total: 2, passed: 0, failed: 2, violations: 4 },
    };
    expect(getViolationSummary(report)).toEqual({
      'sdk-only-deps': 2,
      'boundary-check': 1,
      'no-rollback': 1,
    });
  });

  it('handles a report with mixed passing and failing repos', () => {
    const report: CheckReport = {
      passed: false,
      repos: [
        makeRepo('platform/kb-labs-sdk', [], ['sdk-only-deps']), // no violations
        makeRepo('platform/kb-labs-core', [sdkError, sdkError2]), // 2 violations
      ],
      summary: { total: 2, passed: 1, failed: 1, violations: 2 },
    };
    expect(getViolationSummary(report)).toEqual({ 'sdk-only-deps': 2 });
  });

  it('returns an empty object for an empty repos array', () => {
    const report: CheckReport = {
      passed: true,
      repos: [],
      summary: { total: 0, passed: 0, failed: 0, violations: 0 },
    };
    expect(getViolationSummary(report)).toEqual({});
  });

  it('sums the same rule across multiple repos correctly', () => {
    const report: CheckReport = {
      passed: false,
      repos: [
        makeRepo('plugins/a', [sdkError]),
        makeRepo('plugins/b', [sdkError2]),
        makeRepo('plugins/c', [{ rule: 'sdk-only-deps', severity: 'error', message: 'pkg-e imports core' }]),
      ],
      summary: { total: 3, passed: 0, failed: 3, violations: 3 },
    };
    expect(getViolationSummary(report)).toEqual({ 'sdk-only-deps': 3 });
  });
});

// ---------------------------------------------------------------------------
// Tests: return-value contract
// ---------------------------------------------------------------------------

describe('getViolationSummary — return value contract', () => {
  it('returns a plain object (not null, not an array)', () => {
    const result = getViolationSummary([]);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
  });

  it('is JSON-serialisable', () => {
    const summary = getViolationSummary([sdkError, boundaryWarning]);
    expect(() => JSON.stringify(summary)).not.toThrow();
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});
