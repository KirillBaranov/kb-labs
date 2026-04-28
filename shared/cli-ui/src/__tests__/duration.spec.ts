import { describe, it, expect } from 'vitest';
import { formatDuration } from '../utils/duration';

describe('formatDuration', () => {
  it('returns 0ms for zero input', () => expect(formatDuration(0)).toBe('0ms'));
  it('clamps negative values to 0ms', () => expect(formatDuration(-500)).toBe('0ms'));

  it('formats milliseconds range', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds range', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59999)).toBe('60.0s');
  });

  it('formats minutes range', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3600000)).toBe('60m');
  });
});
