/**
 * Tests for AsyncLocalStorage-based platform context propagation.
 *
 * Tests:
 * - platformContext.run() makes platform available via getStore()
 * - Nested contexts isolate correctly
 * - Context propagates through async/await
 * - usePlatform() returns context platform inside handler, global outside
 * - runInProcess sets context for handler execution
 */

import { describe, it, expect, vi } from 'vitest';
import { platformContext } from '@kb-labs/plugin-contracts';
import type { PlatformServices } from '@kb-labs/plugin-contracts';

function createStubPlatform(label: string): PlatformServices {
  const noop = () => {};
  return {
    logger: { debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop, child: () => ({} as any) } as any,
    llm: { complete: vi.fn().mockResolvedValue({ content: label }), stream: vi.fn() } as any,
    embeddings: { embed: vi.fn(), embedBatch: vi.fn(), dimensions: 1536, getDimensions: vi.fn() } as any,
    vectorStore: { search: vi.fn(), upsert: vi.fn(), delete: vi.fn(), count: vi.fn() } as any,
    cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: vi.fn(), zadd: vi.fn(), zrangebyscore: vi.fn(), zrem: vi.fn(), setIfNotExists: vi.fn() } as any,
    storage: { read: vi.fn(), write: vi.fn(), delete: vi.fn(), list: vi.fn(), exists: vi.fn() } as any,
    analytics: { track: vi.fn(), identify: vi.fn(), flush: vi.fn() } as any,
    eventBus: { publish: vi.fn(), subscribe: vi.fn() } as any,
    config: { getConfig: vi.fn(), getRawConfig: vi.fn() } as any,
    invoke: { call: vi.fn(), isAvailable: vi.fn() } as any,
    sqlDatabase: { query: vi.fn(), transaction: vi.fn(), close: vi.fn() } as any,
    documentDatabase: { find: vi.fn(), findById: vi.fn(), insertOne: vi.fn(), updateMany: vi.fn(), updateById: vi.fn(), deleteMany: vi.fn(), deleteById: vi.fn(), count: vi.fn(), close: vi.fn() } as any,
    logs: { query: vi.fn(), getById: vi.fn(), search: vi.fn(), subscribe: vi.fn(), getStats: vi.fn(), getCapabilities: vi.fn() } as any,
  };
}

describe('platformContext (AsyncLocalStorage)', () => {
  it('should return undefined outside of run()', () => {
    expect(platformContext.getStore()).toBeUndefined();
  });

  it('should return platform inside run()', async () => {
    const platform = createStubPlatform('test');

    await platformContext.run(platform, async () => {
      expect(platformContext.getStore()).toBe(platform);
    });
  });

  it('should propagate through async/await', async () => {
    const platform = createStubPlatform('async-test');

    await platformContext.run(platform, async () => {
      // Simulate async work
      await new Promise<void>(resolve => { setTimeout(resolve, 10); });
      expect(platformContext.getStore()).toBe(platform);

      // Nested async
      const result = await Promise.resolve().then(() => platformContext.getStore());
      expect(result).toBe(platform);
    });
  });

  it('should isolate nested contexts', async () => {
    const platformA = createStubPlatform('A');
    const platformB = createStubPlatform('B');

    await platformContext.run(platformA, async () => {
      expect(platformContext.getStore()).toBe(platformA);

      // Nested run with different platform
      await platformContext.run(platformB, async () => {
        expect(platformContext.getStore()).toBe(platformB);
      });

      // Back to original after nested run exits
      expect(platformContext.getStore()).toBe(platformA);
    });
  });

  it('should isolate parallel executions', async () => {
    const platformA = createStubPlatform('A');
    const platformB = createStubPlatform('B');

    const results: string[] = [];

    await Promise.all([
      platformContext.run(platformA, async () => {
        await new Promise<void>(resolve => { setTimeout(resolve, 20); });
        const store = platformContext.getStore();
        results.push(store === platformA ? 'A-ok' : 'A-WRONG');
      }),
      platformContext.run(platformB, async () => {
        await new Promise<void>(resolve => { setTimeout(resolve, 10); });
        const store = platformContext.getStore();
        results.push(store === platformB ? 'B-ok' : 'B-WRONG');
      }),
    ]);

    expect(results).toContain('A-ok');
    expect(results).toContain('B-ok');
  });

  it('should be shared across bundled copies via Symbol.for', () => {
    // Verify the singleton is on process global
    const ctx = (process as any)[Symbol.for('kb.platformContext')];
    expect(ctx).toBeDefined();
    expect(ctx).toBe(platformContext);
  });
});
