import { describe, it, expect } from 'vitest';
import { ResourceBroker } from '../resource-broker.js';
import { InMemoryRateLimitBackend } from '../../rate-limit/in-memory-backend.js';

function makeBroker(): ResourceBroker {
  return new ResourceBroker(new InMemoryRateLimitBackend());
}

describe('ResourceBroker — getStats', () => {
  it('includes registered resource in stats with zero counters', () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async (_op, args) => args[0] });

    const stats = broker.getStats();

    expect(stats.resources['llm']).toBeDefined();
    expect(stats.totalRequests).toBe(0);
    expect(stats.queueSize).toBe(0);
    expect(stats.uptime).toBeGreaterThanOrEqual(0);
  });

  it('uptime grows over time', async () => {
    const broker = makeBroker();
    const before = broker.getStats().uptime;
    await new Promise<void>(resolve => { setTimeout(resolve, 20); });
    const after = broker.getStats().uptime;

    expect(after).toBeGreaterThan(before);
  });
});

describe('ResourceBroker — isShuttingDown', () => {
  it('returns false before shutdown', () => {
    const broker = makeBroker();
    expect(broker.isShuttingDown()).toBe(false);
  });

  it('returns true after shutdown()', async () => {
    const broker = makeBroker();
    await broker.shutdown();
    expect(broker.isShuttingDown()).toBe(true);
  });
});

describe('ResourceBroker — getRegisteredResources', () => {
  it('returns empty array when no resources are registered', () => {
    const broker = makeBroker();
    expect(broker.getRegisteredResources()).toEqual([]);
  });

  it('returns all registered resource names', () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async () => null });
    broker.register('embeddings', { executor: async () => null });

    const names = broker.getRegisteredResources();
    expect(names).toHaveLength(2);
    expect(names).toContain('llm');
    expect(names).toContain('embeddings');
  });
});

describe('ResourceBroker — hasResource', () => {
  it('returns true for a registered resource', () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async () => null });
    expect(broker.hasResource('llm')).toBe(true);
  });

  it('returns false for an unregistered resource', () => {
    const broker = makeBroker();
    expect(broker.hasResource('vectorStore')).toBe(false);
  });
});

describe('ResourceBroker — unregister', () => {
  it('hasResource returns false after unregister', () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async () => null });
    broker.unregister('llm');
    expect(broker.hasResource('llm')).toBe(false);
  });

  it('removes the resource from getRegisteredResources list', () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async () => null });
    broker.register('embeddings', { executor: async () => null });
    broker.unregister('llm');

    expect(broker.getRegisteredResources()).toEqual(['embeddings']);
  });

  it('is safe to call for a resource that was never registered', () => {
    const broker = makeBroker();
    expect(() => broker.unregister('nonexistent')).not.toThrow();
  });
});

describe('ResourceBroker — pressure control', () => {
  // safetyMargin: 1 disables the default 0.9 cushion so test math is exact.

  it('registerLimit registers the resource without an executor', () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', { requestsPerSecond: 5, safetyMargin: 1 });

    expect(broker.hasResource('webhook')).toBe(true);
    expect(broker.getRegisteredResources()).toContain('webhook');
  });

  it('enqueue on a limit-only resource resolves with a limit-only error', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', { requestsPerSecond: 5, safetyMargin: 1 });

    const response = await broker.enqueue({
      resource: 'webhook',
      operation: 'noop',
      args: [],
      priority: 'normal',
    });

    expect(response.success).toBe(false);
    expect(response.error?.message).toMatch(/limit-only/i);
    expect(response.retries).toBe(0);
  });

  it('tryAcquire allows up to the configured RPS', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', { requestsPerSecond: 5, safetyMargin: 1 });

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await broker.tryAcquire('webhook'));
    }

    for (const r of results) {
      expect(r.allowed).toBe(true);
      expect(typeof r.release).toBe('function');
    }
  });

  it('tryAcquire rejects requests over the RPS limit and release is a safe noop', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', { requestsPerSecond: 2, safetyMargin: 1 });

    const r1 = await broker.tryAcquire('webhook');
    const r2 = await broker.tryAcquire('webhook');
    const r3 = await broker.tryAcquire('webhook');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.waitTimeMs).toBeGreaterThan(0);

    // release() on a rejected acquisition must be a safe noop
    await expect(r3.release()).resolves.toBeUndefined();
  });

  it('release() frees a concurrent slot for a subsequent tryAcquire', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', {
      maxConcurrentRequests: 1,
      safetyMargin: 1,
    });

    const r1 = await broker.tryAcquire('webhook');
    expect(r1.allowed).toBe(true);

    const r2 = await broker.tryAcquire('webhook');
    expect(r2.allowed).toBe(false);

    await r1.release();

    const r3 = await broker.tryAcquire('webhook');
    expect(r3.allowed).toBe(true);
    await r3.release();
  });

  it('release() is idempotent and never drops activeRequests below zero', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', {
      maxConcurrentRequests: 2,
      safetyMargin: 1,
    });

    const r = await broker.tryAcquire('webhook');
    expect(r.allowed).toBe(true);

    await r.release();
    await r.release(); // double release — must be a noop

    const stats = broker.getStats();
    expect(stats.resources['webhook']?.rateLimits.activeRequests).toBe(0);
  });

  it('registerLimit and register coexist independently on the same broker', async () => {
    const broker = makeBroker();
    broker.register('llm', {
      executor: async (_op, args) => args[0],
    });
    broker.registerLimit('webhook', { requestsPerSecond: 2, safetyMargin: 1 });

    // enqueue on llm still works
    const queued = await broker.enqueue({
      resource: 'llm',
      operation: 'complete',
      args: ['hello'],
      priority: 'normal',
    });
    expect(queued.success).toBe(true);
    expect(queued.data).toBe('hello');

    // tryAcquire on webhook respects its own limit
    const w1 = await broker.tryAcquire('webhook');
    const w2 = await broker.tryAcquire('webhook');
    const w3 = await broker.tryAcquire('webhook');
    expect(w1.allowed).toBe(true);
    expect(w2.allowed).toBe(true);
    expect(w3.allowed).toBe(false);
    await w1.release();
    await w2.release();

    // enqueue on the limit-only resource is rejected
    const rejected = await broker.enqueue({
      resource: 'webhook',
      operation: 'noop',
      args: [],
      priority: 'normal',
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error?.message).toMatch(/limit-only/i);
  });

  it('tryAcquire after shutdown returns allowed=false with a noop release', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook', { requestsPerSecond: 5, safetyMargin: 1 });

    await broker.shutdown();

    const r = await broker.tryAcquire('webhook');
    expect(r.allowed).toBe(false);
    await expect(r.release()).resolves.toBeUndefined();
  });

  it('tryAcquire on an unregistered resource throws a contract error', async () => {
    const broker = makeBroker();
    await expect(broker.tryAcquire('unknown')).rejects.toThrow(
      /not registered/i
    );
  });
});

describe('ResourceBroker — shutdown', () => {
  it('resolves without throwing on an empty queue', async () => {
    const broker = makeBroker();
    await expect(broker.shutdown()).resolves.toBeUndefined();
  });

  it('rejects enqueue calls after shutdown', async () => {
    const broker = makeBroker();
    broker.register('llm', { executor: async () => 'ok' });
    await broker.shutdown();

    const response = await broker.enqueue({
      resource: 'llm',
      operation: 'complete',
      args: [],
      priority: 'normal',
    });

    expect(response.success).toBe(false);
    expect(response.error?.message).toMatch(/shutting down/i);
  });
});
