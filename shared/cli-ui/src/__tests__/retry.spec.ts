import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from '../utils/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns value on first try without calling onRetry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('succeeds after retries', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, { attempts: 3, onRetry });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when all attempts exhausted', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('middle'))
      .mockRejectedValue(new Error('last'));

    await expect(withRetry(fn, { attempts: 3 })).rejects.toThrow('last');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('applies fixed delay between retries', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue('ok');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = withRetry(fn, { attempts: 2, delay: 200, backoff: 'fixed' });
    await vi.runAllTimersAsync();
    await promise;

    const delayCalls = setTimeoutSpy.mock.calls.filter(
      (call) => typeof call[1] === 'number' && (call[1] as number) > 0,
    );
    expect(delayCalls[0]?.[1]).toBe(200);
  });

  it('applies exponential backoff between retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue('ok');

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = withRetry(fn, { attempts: 3, delay: 100, backoff: 'exponential' });
    await vi.runAllTimersAsync();
    await promise;

    const delayCalls = setTimeoutSpy.mock.calls
      .filter((call) => typeof call[1] === 'number' && (call[1] as number) > 0)
      .map((call) => call[1] as number);

    expect(delayCalls[0]).toBe(100);  // 100 * 2^0
    expect(delayCalls[1]).toBe(200);  // 100 * 2^1
  });

  it('calls onRetry with error and attempt number', async () => {
    const err1 = new Error('e1');
    const err2 = new Error('e2');
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err1)
      .mockRejectedValueOnce(err2)
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { attempts: 3, onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenNthCalledWith(1, err1, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, err2, 2);
  });

  describe('parameter validation', () => {
    it('throws RangeError when attempts < 1', async () => {
      await expect(withRetry(() => Promise.resolve('ok'), { attempts: 0 })).rejects.toThrow(
        RangeError,
      );
    });

    it('throws RangeError when delay < 0', async () => {
      await expect(withRetry(() => Promise.resolve('ok'), { delay: -1 })).rejects.toThrow(
        RangeError,
      );
    });

    it('throws TypeError when fn is not a function', async () => {
      // @ts-expect-error intentional bad input
      await expect(withRetry('not-a-function')).rejects.toThrow(TypeError);
    });
  });
});
