import { describe, it, expect } from 'vitest';
import { buildDiagnosticReport, formatDiagnosticReport } from '../diagnostics/reporter.js';
import type { DiagnosticEvent } from '@kb-labs/core-discovery';

function makeEvent(
  severity: DiagnosticEvent['severity'],
  code: string,
  pluginId?: string,
): DiagnosticEvent {
  return {
    severity,
    code,
    message: `${code} message`,
    context: pluginId ? { pluginId } : undefined,
    ts: Date.now(),
  };
}

describe('buildDiagnosticReport', () => {
  it('builds empty report', () => {
    const report = buildDiagnosticReport([], 0, 0);
    expect(report.summary).toEqual({
      errors: 0, warnings: 0, totalPlugins: 0, loadedPlugins: 0, failedPlugins: 0,
    });
    expect(report.events).toEqual([]);
    expect(report.byPlugin).toEqual({});
  });

  it('counts errors and warnings', () => {
    const events = [
      makeEvent('error', 'MANIFEST_NOT_FOUND', '@kb-labs/a'),
      makeEvent('error', 'INTEGRITY_MISMATCH', '@kb-labs/b'),
      makeEvent('warning', 'SIGNATURE_MISSING', '@kb-labs/a'),
      makeEvent('info', 'LOCK_NOT_FOUND'),
    ];

    const report = buildDiagnosticReport(events, 5, 3);
    expect(report.summary.errors).toBe(2);
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.totalPlugins).toBe(5);
    expect(report.summary.loadedPlugins).toBe(3);
    expect(report.summary.failedPlugins).toBe(2);
  });

  it('groups events by plugin', () => {
    const events = [
      makeEvent('error', 'MANIFEST_NOT_FOUND', '@kb-labs/a'),
      makeEvent('warning', 'SIGNATURE_MISSING', '@kb-labs/a'),
      makeEvent('error', 'INTEGRITY_MISMATCH', '@kb-labs/b'),
      makeEvent('info', 'LOCK_NOT_FOUND'),
    ];

    const report = buildDiagnosticReport(events, 3, 1);
    expect(report.byPlugin['@kb-labs/a']).toHaveLength(2);
    expect(report.byPlugin['@kb-labs/b']).toHaveLength(1);
    expect(report.byPlugin['__global__']).toHaveLength(1);
  });
});

describe('formatDiagnosticReport', () => {
  it('formats empty report', () => {
    const report = buildDiagnosticReport([], 0, 0);
    const text = formatDiagnosticReport(report);
    expect(text).toContain('0/0 plugins loaded');
  });

  it('includes error details', () => {
    const events = [
      {
        ...makeEvent('error', 'MANIFEST_NOT_FOUND', '@kb-labs/broken'),
        remediation: 'Run kb marketplace install',
      },
    ];

    const report = buildDiagnosticReport(events, 1, 0);
    const text = formatDiagnosticReport(report);
    expect(text).toContain('ERR');
    expect(text).toContain('MANIFEST_NOT_FOUND');
    expect(text).toContain('@kb-labs/broken');
    expect(text).toContain('Fix: Run kb marketplace install');
  });
});
