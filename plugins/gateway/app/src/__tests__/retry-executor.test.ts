/**
 * Unit tests for executeWithRetry (CC3 — Retry logic).
 */
import { describe, it, expect, vi } from 'vitest';
import { executeWithRetry } from '../execute/retry-executor.js';
import { CancelledError } from '../execute/errors.js';
import type { ExecutionEventMessage } from '@kb-labs/gateway-contracts';
import type { ExecutionRetryConfig } from '@kb-labs/core-contracts';

function makeCtx(overrides: {
  signal?: AbortSignal;
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  onlyRetryable?: boolean;
} = {}) {
  const controller = new AbortController();
  const write = vi.fn<(event: ExecutionEventMessage) => void>();

  // Build config with only the fields that were explicitly provided.
  // Undefined keys must not be present — they would override DEFAULTS via spread.
  const config: ExecutionRetryConfig = {};
  if (overrides.maxAttempts !== undefined) {config['maxAttempts'] = overrides.maxAttempts;}
  if (overrides.initialDelayMs !== undefined) {config['initialDelayMs'] = overrides.initialDelayMs;}
  if (overrides.backoffMultiplier !== undefined) {config['backoffMultiplier'] = overrides.backoffMultiplier;}
  if (overrides.maxDelayMs !== undefined) {config['maxDelayMs'] = overrides.maxDelayMs;}
  if (overrides.onlyRetryable !== undefined) {config['onlyRetryable'] = overrides.onlyRetryable;}

  return {
    ctx: {
      executionId: 'exec-test',
      requestId: 'req-test',
      signal: overrides.signal ?? controller.signal,
      config: Object.keys(config).length > 0 ? config : undefined,
      write,
    },
    controller,
    write,
  };
}

// ── basic success ─────────────────────────────────────────────────────────────

describe('executeWithRetry — success paths', () => {
  it('returns result on first attempt', async () => {
    const { ctx } = makeCtx();
    const dispatch = vi.fn().mockResolvedValue('done');
    const result = await executeWithRetry(ctx, dispatch);
    expect(result).toBe('done');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('succeeds after one failure when maxAttempts=2', async () => {
    const { ctx } = makeCtx({ maxAttempts: 2, initialDelayMs: 5 });
    let calls = 0;
    const dispatch = vi.fn(async () => {
      calls++;
      if (calls === 1) {throw new Error('503 Service Unavailable');}
      return 'recovered';
    });
    const result = await executeWithRetry(ctx, dispatch);
    expect(result).toBe('recovered');
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('returns value from later attempt', async () => {
    const { ctx } = makeCtx({ maxAttempts: 3, initialDelayMs: 5, backoffMultiplier: 1 });
    let calls = 0;
    const dispatch = vi.fn(async () => {
      calls++;
      if (calls < 3) {throw new Error('ECONNREFUSED');}
      return 42;
    });
    const result = await executeWithRetry(ctx, dispatch);
    expect(result).toBe(42);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});

// ── retry limit ───────────────────────────────────────────────────────────────

describe('executeWithRetry — exhausted retries', () => {
  it('throws last error after maxAttempts exhausted', async () => {
    const { ctx } = makeCtx({ maxAttempts: 3, initialDelayMs: 5 });
    const dispatch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(executeWithRetry(ctx, dispatch)).rejects.toThrow('ECONNREFUSED');
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it('emits execution:retry event between attempts', async () => {
    const { ctx, write } = makeCtx({ maxAttempts: 2, initialDelayMs: 5 });
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue('ok');
    await executeWithRetry(ctx, dispatch);
    const retryEvents = write.mock.calls.map(([e]) => e).filter((e) => e.type === 'execution:retry');
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]).toMatchObject({
      type: 'execution:retry',
      executionId: 'exec-test',
      attempt: 1,
      maxAttempts: 2,
    });
  });

  it('does not retry non-retryable errors by default (onlyRetryable=true)', async () => {
    const { ctx } = makeCtx({ maxAttempts: 5, initialDelayMs: 5 });
    // "some handler error" is not in the retryable list
    const dispatch = vi.fn().mockRejectedValue(new Error('Handler threw an exception'));
    await expect(executeWithRetry(ctx, dispatch)).rejects.toThrow('Handler threw an exception');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('retries non-retryable when onlyRetryable=false', async () => {
    const { ctx } = makeCtx({ maxAttempts: 3, initialDelayMs: 5, onlyRetryable: false });
    let calls = 0;
    const dispatch = vi.fn(async () => {
      calls++;
      if (calls < 3) {throw new Error('Handler threw an exception');}
      return 'ok';
    });
    const result = await executeWithRetry(ctx, dispatch);
    expect(result).toBe('ok');
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});

// ── cancellation ──────────────────────────────────────────────────────────────

describe('executeWithRetry — cancellation', () => {
  it('throws CancelledError immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort('user');
    const { ctx } = makeCtx({ signal: controller.signal });
    const dispatch = vi.fn().mockResolvedValue('never');
    await expect(executeWithRetry(ctx, dispatch)).rejects.toBeInstanceOf(CancelledError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('throws CancelledError when signal aborts during dispatch', async () => {
    const controller = new AbortController();
    const { ctx } = makeCtx({ signal: controller.signal, maxAttempts: 1 });
    const dispatch = vi.fn(
      () => new Promise<string>((_, reject) => {
        // Simulate a long-running operation
        setTimeout(() => reject(new Error('should not happen')), 5000);
      }),
    );
    // Abort almost immediately
    setTimeout(() => controller.abort('user'), 20);
    await expect(executeWithRetry(ctx, dispatch)).rejects.toBeInstanceOf(CancelledError);
  }, 3000);

  it('aborts during retry backoff delay', async () => {
    const controller = new AbortController();
    const { ctx } = makeCtx({
      signal: controller.signal,
      maxAttempts: 5,
      initialDelayMs: 2000, // long delay
    });
    const dispatch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    // Abort shortly after first failure triggers backoff
    setTimeout(() => controller.abort('disconnect'), 30);
    await expect(executeWithRetry(ctx, dispatch)).rejects.toBeInstanceOf(CancelledError);
    // Should have called dispatch once and then been interrupted during delay
    expect(dispatch).toHaveBeenCalledTimes(1);
  }, 3000);

  it('does not retry after CancelledError', async () => {
    const { ctx } = makeCtx({ maxAttempts: 5, initialDelayMs: 5 });
    const controller = new AbortController();
    (ctx as { signal: AbortSignal }).signal = controller.signal;
    const dispatch = vi.fn().mockRejectedValue(new CancelledError('user'));
    await expect(executeWithRetry(ctx, dispatch)).rejects.toBeInstanceOf(CancelledError);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

// ── error classification ──────────────────────────────────────────────────────

describe('executeWithRetry — retryable error classification', () => {
  const retryableMessages = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'request timed out',
    '503 Service Unavailable',
    'Host not connected',
  ];

  const nonRetryableMessages = [
    'TypeError: Cannot read property',
    'SyntaxError: unexpected token',
    'Handler threw',
  ];

  for (const msg of retryableMessages) {
    it(`retries on: "${msg}"`, async () => {
      const { ctx } = makeCtx({ maxAttempts: 2, initialDelayMs: 5 });
      let calls = 0;
      const dispatch = vi.fn(async () => {
        calls++;
        if (calls === 1) {throw new Error(msg);}
        return 'ok';
      });
      const result = await executeWithRetry(ctx, dispatch);
      expect(result).toBe('ok');
      expect(dispatch).toHaveBeenCalledTimes(2);
    });
  }

  for (const msg of nonRetryableMessages) {
    it(`does not retry on: "${msg}"`, async () => {
      const { ctx } = makeCtx({ maxAttempts: 5, initialDelayMs: 5 });
      const dispatch = vi.fn().mockRejectedValue(new Error(msg));
      await expect(executeWithRetry(ctx, dispatch)).rejects.toThrow(msg);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  }
});

// ── maxAttempts edge cases ────────────────────────────────────────────────────

describe('executeWithRetry — maxAttempts edge cases', () => {
  it('treats maxAttempts=0 as 1 attempt', async () => {
    const { ctx } = makeCtx({ maxAttempts: 0 });
    const dispatch = vi.fn().mockResolvedValue('ok');
    await executeWithRetry(ctx, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('default config (undefined) is single attempt', async () => {
    const controller = new AbortController();
    const write = vi.fn<(event: ExecutionEventMessage) => void>();
    const dispatch = vi.fn().mockResolvedValue('result');
    const result = await executeWithRetry(
      { executionId: 'e', requestId: 'r', signal: controller.signal, config: undefined, write },
      dispatch,
    );
    expect(result).toBe('result');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
