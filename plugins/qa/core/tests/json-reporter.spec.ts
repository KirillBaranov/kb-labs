import { describe, it, expect } from 'vitest';
import { buildJsonReport } from '../src/report/json-reporter.js';
import type { QAResults, QACheckConfig } from '@kb-labs/qa-contracts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function passed(...names: string[]) {
  return { passed: names, failed: [], skipped: [], errors: {} };
}

function failed(names: string[], errors: Record<string, string> = {}) {
  return { passed: [], failed: names, skipped: [], errors };
}

function failedWithDetails(names: string[], details: Record<string, { target: string; message: string; fix?: string }[]>) {
  return { passed: [], failed: names, skipped: [], errors: {}, details };
}

// ─── status field ─────────────────────────────────────────────────────────────

describe('buildJsonReport — status', () => {
  it('passed when all checks pass', () => {
    const results: QAResults = { build: passed('pkg-a'), test: passed('pkg-a') };
    const report = buildJsonReport(results);
    expect(report.status).toBe('passed');
  });

  it('failed when a blocker check has failures', () => {
    const results: QAResults = { build: failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'build', command: 'x', severity: 'blocker' }]);
    expect(report.status).toBe('failed');
  });

  it('passed when only warning check fails', () => {
    const results: QAResults = { 'doc-staleness': failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'doc-staleness', command: 'x', severity: 'warning' }]);
    expect(report.status).toBe('passed');
  });

  it('passed when only info check fails', () => {
    const results: QAResults = { 'metrics': failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'metrics', command: 'x', severity: 'info' }]);
    expect(report.status).toBe('passed');
  });

  it('failed when blocker fails even if warning also fails', () => {
    const results: QAResults = {
      build: failed(['pkg-a']),
      'doc-check': failed(['pkg-b']),
    };
    const checks: QACheckConfig[] = [
      { id: 'build', command: 'x', severity: 'blocker' },
      { id: 'doc-check', command: 'x', severity: 'warning' },
    ];
    const report = buildJsonReport(results, null, checks);
    expect(report.status).toBe('failed');
  });

  it('defaults to blocker severity when no config provided', () => {
    const results: QAResults = { test: failed(['pkg-a']) };
    const report = buildJsonReport(results);
    expect(report.status).toBe('failed');
  });
});

// ─── blockers[] ───────────────────────────────────────────────────────────────

describe('buildJsonReport — blockers', () => {
  it('empty when all checks pass', () => {
    const results: QAResults = { build: passed('pkg-a') };
    const report = buildJsonReport(results, null, [{ id: 'build', command: 'x', severity: 'blocker' }]);
    expect(report.blockers).toHaveLength(0);
  });

  it('populated for failed blocker check', () => {
    const results: QAResults = { build: failed(['pkg-a'], { 'pkg-a': 'TS2345 error' }) };
    const report = buildJsonReport(results, null, [{ id: 'build', command: 'x', severity: 'blocker' }]);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]!.check).toBe('build');
    expect(report.blockers[0]!.items[0]!.target).toBe('pkg-a');
    expect(report.blockers[0]!.items[0]!.message).toBe('TS2345 error');
  });

  it('uses structured details when available', () => {
    const results: QAResults = {
      'test-coverage': failedWithDetails(
        ['pkg-a'],
        { 'pkg-a': [{ target: 'src/foo.ts', message: 'no test', fix: 'create foo.test.ts' }] },
      ),
    };
    const report = buildJsonReport(results, null, [{ id: 'test-coverage', command: 'x', severity: 'blocker' }]);
    const items = report.blockers[0]!.items;
    expect(items[0]!.target).toBe('src/foo.ts');
    expect(items[0]!.fix).toBe('create foo.test.ts');
  });

  it('warning check not in blockers', () => {
    const results: QAResults = { 'doc-check': failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'doc-check', command: 'x', severity: 'warning' }]);
    expect(report.blockers).toHaveLength(0);
  });
});

// ─── warnings[] ──────────────────────────────────────────────────────────────

describe('buildJsonReport — warnings', () => {
  it('empty when no warning checks fail', () => {
    const results: QAResults = { build: passed('pkg-a') };
    const report = buildJsonReport(results, null, [{ id: 'build', command: 'x', severity: 'blocker' }]);
    expect(report.warnings).toHaveLength(0);
  });

  it('populated for failed warning check', () => {
    const results: QAResults = { 'doc-staleness': failed(['pkg-a'], { 'pkg-a': 'ADR-0015 stale' }) };
    const report = buildJsonReport(results, null, [{ id: 'doc-staleness', command: 'x', severity: 'warning' }]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]!.check).toBe('doc-staleness');
    expect(report.warnings[0]!.items[0]!.message).toBe('ADR-0015 stale');
  });

  it('blocker check not in warnings', () => {
    const results: QAResults = { test: failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'test', command: 'x', severity: 'blocker' }]);
    expect(report.warnings).toHaveLength(0);
  });

  it('info check not in warnings or blockers', () => {
    const results: QAResults = { metrics: failed(['pkg-a']) };
    const report = buildJsonReport(results, null, [{ id: 'metrics', command: 'x', severity: 'info' }]);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });
});

// ─── backward compat — no checks config ──────────────────────────────────────

describe('buildJsonReport — backward compat', () => {
  it('summary still populated', () => {
    const results: QAResults = { build: { passed: ['a', 'b'], failed: ['c'], skipped: [], errors: { c: 'err' } } };
    const report = buildJsonReport(results);
    expect(report.summary['build']?.total).toBe(3);
    expect(report.summary['build']?.failed).toBe(1);
  });

  it('failures still populated', () => {
    const results: QAResults = { test: failed(['pkg-a', 'pkg-b']) };
    const report = buildJsonReport(results);
    expect(report.failures['test']).toEqual(['pkg-a', 'pkg-b']);
  });

  it('blockers defaults to blocker severity when no config', () => {
    const results: QAResults = { lint: failed(['pkg-a'], { 'pkg-a': 'lint error' }) };
    const report = buildJsonReport(results);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]!.check).toBe('lint');
  });
});
