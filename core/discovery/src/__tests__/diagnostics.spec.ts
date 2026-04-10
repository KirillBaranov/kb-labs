import { describe, it, expect } from 'vitest';
import { DiagnosticCollector } from '../diagnostics.js';

describe('DiagnosticCollector', () => {
  it('starts with no events', () => {
    const diag = new DiagnosticCollector();
    expect(diag.getEvents()).toEqual([]);
    expect(diag.hasErrors()).toBe(false);
  });

  it('collects events with correct severity', () => {
    const diag = new DiagnosticCollector();
    diag.error('MANIFEST_NOT_FOUND', 'No manifest', { pluginId: '@kb-labs/foo' });
    diag.warning('SIGNATURE_MISSING', 'Not signed');
    diag.info('LOCK_NOT_FOUND', 'No lock file');
    diag.debug('LOCK_NOT_FOUND', 'Debug info');

    const events = diag.getEvents();
    expect(events).toHaveLength(4);
    expect(events[0]!.severity).toBe('error');
    expect(events[0]!.code).toBe('MANIFEST_NOT_FOUND');
    expect(events[0]!.context?.pluginId).toBe('@kb-labs/foo');
    expect(events[1]!.severity).toBe('warning');
    expect(events[2]!.severity).toBe('info');
    expect(events[3]!.severity).toBe('debug');
  });

  it('hasErrors returns true only when errors exist', () => {
    const diag = new DiagnosticCollector();
    diag.warning('SIGNATURE_MISSING', 'Not signed');
    expect(diag.hasErrors()).toBe(false);

    diag.error('MANIFEST_NOT_FOUND', 'Missing');
    expect(diag.hasErrors()).toBe(true);
  });

  it('countBySeverity returns correct counts', () => {
    const diag = new DiagnosticCollector();
    diag.error('MANIFEST_NOT_FOUND', 'a');
    diag.error('INTEGRITY_MISMATCH', 'b');
    diag.warning('SIGNATURE_MISSING', 'c');
    diag.info('LOCK_NOT_FOUND', 'd');

    expect(diag.countBySeverity()).toEqual({
      error: 2,
      warning: 1,
      info: 1,
      debug: 0,
    });
  });

  it('includes remediation and stack when provided', () => {
    const diag = new DiagnosticCollector();
    diag.error('MANIFEST_NOT_FOUND', 'Missing', {
      pluginId: 'test',
      filePath: '/some/path',
      remediation: 'Run kb marketplace install',
      stack: 'Error: ...',
    });

    const event = diag.getEvents()[0]!;
    expect(event.remediation).toBe('Run kb marketplace install');
    expect(event.stack).toBe('Error: ...');
    expect(event.context?.filePath).toBe('/some/path');
  });

  it('getEvents returns a copy', () => {
    const diag = new DiagnosticCollector();
    diag.error('MANIFEST_NOT_FOUND', 'test');
    const events1 = diag.getEvents();
    const events2 = diag.getEvents();
    expect(events1).not.toBe(events2);
    expect(events1).toEqual(events2);
  });

  it('records timestamp on each event', () => {
    const before = Date.now();
    const diag = new DiagnosticCollector();
    diag.info('LOCK_NOT_FOUND', 'test');
    const after = Date.now();

    const ts = diag.getEvents()[0]!.ts;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
