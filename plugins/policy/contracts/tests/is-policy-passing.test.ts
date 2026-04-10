import { describe, expect, it } from 'vitest';
import { isPolicyPassing } from '../src/helpers.js';
import type { CheckReport } from '../src/types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const passingReport: CheckReport = {
  passed: true,
  repos: [],
  summary: { total: 2, passed: 2, failed: 0, violations: 0 },
};

const failingReport: CheckReport = {
  passed: false,
  repos: [],
  summary: { total: 2, passed: 1, failed: 1, violations: 3 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isPolicyPassing', () => {
  it('returns true for a passing report', () => {
    expect(isPolicyPassing(passingReport)).toBe(true);
  });

  it('returns false for a failing report', () => {
    expect(isPolicyPassing(failingReport)).toBe(false);
  });
});
