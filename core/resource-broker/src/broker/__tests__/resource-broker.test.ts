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
