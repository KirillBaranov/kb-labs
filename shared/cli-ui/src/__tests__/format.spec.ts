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
  it('returns 0ms for zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('returns 0ms for negative values', () => {
    expect(formatDuration(-500)).toBe('0ms');
  });

  it('formats milliseconds range', () => {
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats exactly 1 second', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('formats fractional seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formats seconds near the minute boundary', () => {
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats exactly 1 minute', () => {
    expect(formatDuration(60000)).toBe('1m');
  });

  it('formats minutes with remaining seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('formats exactly 2 minutes without seconds', () => {
    expect(formatDuration(120000)).toBe('2m');
  });

  it('omits seconds part when remainder rounds to 0', () => {
    expect(formatDuration(120400)).toBe('2m');
  });
});

