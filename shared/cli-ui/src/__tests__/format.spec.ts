import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimestamp, formatRelativeTime } from '../format';

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

