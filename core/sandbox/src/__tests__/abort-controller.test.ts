import { describe, it, expect, vi } from 'vitest';
import { createTimeoutSignal } from '../cancellation/abort-controller.js';

describe('createTimeoutSignal', () => {
  it('returns an AbortSignal', () => {
    const signal = createTimeoutSignal(10_000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('aborts after timeout', async () => {
    vi.useFakeTimers();
    const signal = createTimeoutSignal(100);

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(100);

    expect(signal.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('does not abort before timeout', () => {
    vi.useFakeTimers();
    const signal = createTimeoutSignal(1000);

    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);

    vi.useRealTimers();
  });
});
