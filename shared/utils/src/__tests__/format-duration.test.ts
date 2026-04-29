import { describe, expect, it } from 'vitest';
import { formatDuration } from '../format-duration.js';

describe('formatDuration', () => {
  it('returns 0ms for 0', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('returns 0ms for negative values', () => {
    expect(formatDuration(-500)).toBe('0ms');
    expect(formatDuration(-1)).toBe('0ms');
  });

  it('returns ms for values under 1000', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('returns seconds for values in the seconds range', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(1500)).toBe('2s');
    expect(formatDuration(10000)).toBe('10s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('returns minutes for values in the minutes range', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(120000)).toBe('2m');
    expect(formatDuration(3600000)).toBe('60m');
  });

  it('returns minutes and seconds when remainder is non-zero', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});
