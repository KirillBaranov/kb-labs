/**
 * E2E scenarios for ResourceBroker pressure-control (tryAcquire / registerLimit).
 *
 * Simulates the gateway-middleware lifecycle end-to-end against a real
 * InMemoryRateLimitBackend. Unit-level guarantees live in `resource-broker.test.ts`;
 * this file exercises realistic flows (bursts, concurrent recycling, mixed
 * queue+pressure load, graceful shutdown).
 */

import { describe, it, expect } from 'vitest';
import { ResourceBroker } from '../resource-broker.js';
import { InMemoryRateLimitBackend } from '../../rate-limit/in-memory-backend.js';

function makeBroker(): ResourceBroker {
  return new ResourceBroker(new InMemoryRateLimitBackend());
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

describe('pressure-control E2E', () => {
  it('webhook burst under the RPS limit — all admitted, stats clean after release', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook:github', {
      requestsPerSecond: 50,
      safetyMargin: 1,
    });

    const results = await Promise.all(
      Array.from({ length: 50 }, () => broker.tryAcquire('webhook:github'))
    );

    expect(results.every(r => r.allowed)).toBe(true);

    await Promise.all(results.map(r => r.release()));

    const stats = broker.getStats();
    expect(stats.resources['webhook:github']?.rateLimits.activeRequests).toBe(0);
  });

  it('webhook burst over the RPS limit — exact split between allowed and rejected', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook:github', {
      requestsPerSecond: 10,
      safetyMargin: 1,
    });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => broker.tryAcquire('webhook:github'))
    );

    const allowed = results.filter(r => r.allowed);
    const rejected = results.filter(r => !r.allowed);

    expect(allowed).toHaveLength(10);
    expect(rejected).toHaveLength(15);
    expect(rejected.every(r => (r.waitTimeMs ?? 0) > 0)).toBe(true);

    // Releasing allowed acquisitions + noop release on rejected leaves counters clean.
    await Promise.all(results.map(r => r.release()));

    const stats = broker.getStats();
    expect(stats.resources['webhook:github']?.rateLimits.activeRequests).toBe(0);
  });

  it('concurrent slot recycling — 20 tasks share 5 slots without deadlock', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook:stripe', {
      maxConcurrentRequests: 5,
      safetyMargin: 1,
    });

    // Each task polls tryAcquire until allowed, simulates 10ms of work, releases.
    async function task(): Promise<void> {
      // bounded retry — must succeed well within this
      for (let attempt = 0; attempt < 500; attempt++) {
        const r = await broker.tryAcquire('webhook:stripe');
        if (r.allowed) {
          try {
            await sleep(10);
          } finally {
            await r.release();
          }
          return;
        }
        await sleep(r.waitTimeMs ?? 20);
      }
      throw new Error('task could not acquire — deadlock?');
    }

    await Promise.all(Array.from({ length: 20 }, () => task()));

    const stats = broker.getStats();
    expect(stats.resources['webhook:stripe']?.rateLimits.activeRequests).toBe(0);
  });

  it('mixed queue + pressure workload — enqueue and tryAcquire do not interfere', async () => {
    const broker = makeBroker();

    broker.register('llm', {
      executor: async (_op, args) => `processed:${args[0]}`,
    });
    broker.registerLimit('webhook:stripe', {
      requestsPerSecond: 5,
      safetyMargin: 1,
    });

    const queuedWork = Promise.all(
      Array.from({ length: 10 }, (_unused, i) =>
        broker.enqueue<string>({
          resource: 'llm',
          operation: 'complete',
          args: [`req-${i}`],
          priority: 'normal',
        })
      )
    );

    const pressureWork = Promise.all(
      Array.from({ length: 8 }, () => broker.tryAcquire('webhook:stripe'))
    );

    const [queueResults, pressureResults] = await Promise.all([
      queuedWork,
      pressureWork,
    ]);

    // All LLM requests succeeded
    expect(queueResults.every(r => r.success)).toBe(true);
    expect(queueResults.map(r => r.data)).toEqual(
      Array.from({ length: 10 }, (_unused, i) => `processed:req-${i}`)
    );

    // Webhook pressure honoured its own limit, independent of LLM traffic
    const allowed = pressureResults.filter(r => r.allowed);
    const rejected = pressureResults.filter(r => !r.allowed);
    expect(allowed).toHaveLength(5);
    expect(rejected).toHaveLength(3);

    await Promise.all(pressureResults.map(r => r.release()));

    // enqueue on the pressure resource is rejected with limit-only error
    const wrongCall = await broker.enqueue({
      resource: 'webhook:stripe',
      operation: 'noop',
      args: [],
      priority: 'normal',
    });
    expect(wrongCall.success).toBe(false);
    expect(wrongCall.error?.message).toMatch(/limit-only/i);

    const stats = broker.getStats();
    expect(stats.resources['llm']?.totalRequests).toBe(10);
    expect(stats.resources['llm']?.totalSuccess).toBe(10);
    expect(stats.resources['webhook:stripe']).toBeDefined();
  });

  it('graceful shutdown under load — no unhandled rejections, tryAcquire denied cleanly', async () => {
    const broker = makeBroker();
    broker.registerLimit('webhook:github', {
      requestsPerSecond: 100,
      safetyMargin: 1,
    });

    // Hold one acquisition open across shutdown.
    const held = await broker.tryAcquire('webhook:github');
    expect(held.allowed).toBe(true);

    await broker.shutdown();

    // Fire a flood of tryAcquire after shutdown — all must be denied without throwing.
    const denied = await Promise.all(
      Array.from({ length: 25 }, () => broker.tryAcquire('webhook:github'))
    );

    expect(denied.every(r => !r.allowed)).toBe(true);
    // releasing denied acquisitions and the held one — all noop/safe
    await Promise.all([held.release(), ...denied.map(r => r.release())]);

    // double release on the held acquisition is idempotent
    await expect(held.release()).resolves.toBeUndefined();
  });
});
