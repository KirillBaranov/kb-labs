import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimestamp, formatRelativeTime, formatDuration } from '../format';

describe('format helpers', () => {
  const baseDate = new Date('2025-01-01T00:05:30Z');

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats timestamp in ISO mode with offset', () => {
    expect(formatTimestamp(baseDate, { mode: 'iso', timeZone: 'UTC' })).toBe('2025-01-01T00:05:30.000Z (+00:00)');
    expect(formatTimestamp(baseDate, { mode: 'iso', timeZone: 'UTC', includeMilliseconds: false })).toBe(
      '2025-01-01T00:05:30Z (+00:00)',
    );
  });

  it('formats timestamp in local mode for a specific timezone', () => {
    expect(
      formatTimestamp(baseDate, {
        mode: 'local',
        timeZone: 'UTC',
        includeSeconds: true,
      }),
    ).toBe('2025-01-01 00:05:30 (+00:00)');

    expect(
      formatTimestamp(baseDate, {
        mode: 'local',
        timeZone: 'America/Los_Angeles',
        includeSeconds: true,
      }),
    ).toBe('2024-12-31 16:05:30 (-08:00)');
  });

  it('returns human-friendly relative time', () => {
    const now = new Date('2025-01-01T00:06:30Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatRelativeTime(baseDate)).toBe('1 minute ago');
  });
});

describe('formatDuration', () => {
  it('returns 0ms for zero', () => expect(formatDuration(0)).toBe('0ms'));
  it('clamps negative to 0ms', () => expect(formatDuration(-500)).toBe('0ms'));
  it('formats milliseconds range', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(999)).toBe('999ms');
  });
  it('formats seconds range', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59999)).toBe('60.0s');
  });
  it('formats minutes range without remainder', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(120000)).toBe('2m');
  });
  it('formats minutes range with seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3661000)).toBe('61m 1s');
  });
});

