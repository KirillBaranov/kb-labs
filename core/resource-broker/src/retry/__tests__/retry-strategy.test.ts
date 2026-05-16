import { describe, it, expect, vi } from 'vitest';
import {
  calculateBackoffDelay,
  shouldRetry,
  withRetry,
  createRateLimitRetryConfig,
  createQuickRetryConfig,
} from '../retry-strategy.js';
import type { RetryConfig } from '../../types.js';

const baseConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: 0, // disable jitter for deterministic tests
  retryableErrors: ['rate_limit', 'server_error', 'timeout', 'network'],
};

describe('calculateBackoffDelay', () => {
  it('attempt 0 → baseDelay * 2^0 = baseDelay', () => {
    const delay = calculateBackoffDelay(0, baseConfig);
    expect(delay).toBe(1000);
  });

  it('attempt 1 → baseDelay * 2^1 = 2000', () => {
    expect(calculateBackoffDelay(1, baseConfig)).toBe(2000);
  });

  it('attempt 2 → baseDelay * 2^2 = 4000', () => {
    expect(calculateBackoffDelay(2, baseConfig)).toBe(4000);
  });

  it('caps at maxDelay', () => {
    const config: RetryConfig = { ...baseConfig, baseDelay: 1000, maxDelay: 3000 };
    // attempt 3 → 8000, but capped at 3000
    expect(calculateBackoffDelay(3, config)).toBe(3000);
  });

  it('retryAfterHint overrides exponential backoff', () => {
    expect(calculateBackoffDelay(0, baseConfig, 8000)).toBe(8000);
  });

  it('retryAfterHint is capped at maxDelay', () => {
    const config: RetryConfig = { ...baseConfig, maxDelay: 5000 };
    expect(calculateBackoffDelay(0, config, 99999)).toBe(5000);
  });

  it('retryAfterHint=0 is ignored (falls back to backoff)', () => {
    const delay = calculateBackoffDelay(0, baseConfig, 0);
    expect(delay).toBe(1000); // base delay, no hint
  });

  it('jitter increases delay within expected range', () => {
    const configWithJitter: RetryConfig = { ...baseConfig, jitter: 0.2 };
    const delay = calculateBackoffDelay(0, configWithJitter);
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1200);
  });
});

describe('shouldRetry', () => {
  it('retryable error + attempts left → shouldRetry=true', () => {
    const decision = shouldRetry(new Error('503 service unavailable'), 0, baseConfig);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.attempt).toBe(0);
    expect(decision.maxAttempts).toBe(3);
    expect(decision.errorType).toBe('server_error');
  });

  it('non-retryable error → shouldRetry=false', () => {
    const decision = shouldRetry(new Error('401 Unauthorized'), 0, baseConfig);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.delayMs).toBe(0);
  });

  it('retryable error but no attempts left → shouldRetry=false', () => {
    const decision = shouldRetry(new Error('timeout'), 3, baseConfig); // attempt=3, maxRetries=3
    expect(decision.shouldRetry).toBe(false);
  });

  it('rate_limit uses at least 5s base delay', () => {
    const decision = shouldRetry(new Error('rate limit'), 0, { ...baseConfig, baseDelay: 100 });
    expect(decision.shouldRetry).toBe(true);
    // rate_limit forces min 5000ms base
    expect(decision.delayMs).toBeGreaterThanOrEqual(5000);
  });

  it('delayMs=0 when not retrying', () => {
    const decision = shouldRetry(new Error('404 Not Found'), 0, baseConfig);
    expect(decision.delayMs).toBe(0);
  });

  it('uses DEFAULT_RETRY_CONFIG when no config given', () => {
    const decision = shouldRetry(new Error('timeout'), 0);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.maxAttempts).toBe(3);
  });
});

describe('withRetry', () => {
  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const { result, attempts } = await withRetry(fn, baseConfig);
    expect(result).toBe('result');
    expect(attempts).toBe(1);
  });

  it('retries and succeeds on 3rd attempt', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('503 service unavailable');
      return 'ok';
    });

    // Use zero delay to speed up test
    const { result, attempts } = await withRetry(fn, { ...baseConfig, baseDelay: 0, maxDelay: 0 });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws last error after all retries exhausted', async () => {
    const err = new Error('timeout');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { ...baseConfig, maxRetries: 2, baseDelay: 0, maxDelay: 0 })
    ).rejects.toThrow('timeout');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('stops immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
    await expect(withRetry(fn, baseConfig)).rejects.toThrow('401 Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1); // no retries
  });
});

describe('createRateLimitRetryConfig', () => {
  it('defaults to maxRetries=5, baseDelay=5000', () => {
    const config = createRateLimitRetryConfig();
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelay).toBe(5000);
    expect(config.maxDelay).toBe(60000);
    expect(config.retryableErrors).toContain('rate_limit');
  });

  it('accepts custom maxRetries', () => {
    expect(createRateLimitRetryConfig(10).maxRetries).toBe(10);
  });
});

describe('createQuickRetryConfig', () => {
  it('defaults to maxRetries=3, baseDelay=500', () => {
    const config = createQuickRetryConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelay).toBe(500);
    expect(config.maxDelay).toBe(5000);
  });

  it('does not include rate_limit (quick ops should not wait 5s)', () => {
    expect(createQuickRetryConfig().retryableErrors).not.toContain('rate_limit');
  });
});
