import { describe, it, expect, vi } from 'vitest';
import { applyPluginGovernance, assemblePlatform } from '../pipeline';
import type { PlatformConfig } from '../pipeline';
import type { PlatformServices, PermissionSpec } from '@kb-labs/plugin-contracts';
import type { MiddlewareContext } from '../middleware';
import { PermissionError } from '@kb-labs/plugin-contracts';

function makeNoop() {
  return vi.fn(async () => {});
}

function createMockPlatform(): PlatformServices {
  const logger = {
    debug: makeNoop(),
    info: makeNoop(),
    warn: makeNoop(),
    error: makeNoop(),
    fatal: makeNoop(),
    trace: makeNoop(),
    child: vi.fn().mockReturnValue({} as ReturnType<PlatformServices['logger']['child']>),
  } as unknown as PlatformServices['logger'];

  return {
    logger,
    llm: { complete: makeNoop(), stream: vi.fn(async function* () {}) } as unknown as PlatformServices['llm'],
    embeddings: { embed: makeNoop(), embedBatch: makeNoop(), getDimensions: makeNoop() } as unknown as PlatformServices['embeddings'],
    vectorStore: { search: makeNoop(), upsert: makeNoop(), delete: makeNoop(), count: makeNoop() } as unknown as PlatformServices['vectorStore'],
    cache: { get: makeNoop(), set: makeNoop(), delete: makeNoop(), clear: makeNoop(), zadd: makeNoop(), zrangebyscore: makeNoop(), zrem: makeNoop(), setIfNotExists: makeNoop() } as unknown as PlatformServices['cache'],
    storage: { read: makeNoop(), write: makeNoop(), delete: makeNoop(), exists: makeNoop(), list: makeNoop() } as unknown as PlatformServices['storage'],
    analytics: { track: makeNoop(), identify: makeNoop(), flush: makeNoop() } as unknown as PlatformServices['analytics'],
    eventBus: { publish: makeNoop(), subscribe: vi.fn(() => () => {}) } as unknown as PlatformServices['eventBus'],
    config: {} as PlatformServices['config'],
    invoke: { call: makeNoop(), isAvailable: makeNoop() } as unknown as PlatformServices['invoke'],
    sqlDatabase: {} as PlatformServices['sqlDatabase'],
    documentDatabase: {} as PlatformServices['documentDatabase'],
    logs: {} as PlatformServices['logs'],
  };
}

describe('applyPluginGovernance', () => {
  it('creates child logger with pluginId', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = {};
    applyPluginGovernance(raw, permissions, 'my-plugin');
    expect(raw.logger.child).toHaveBeenCalledWith({ plugin: 'my-plugin' });
  });

  it('denies llm access when permission is false', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = { platform: { llm: false } };
    const governed = applyPluginGovernance(raw, permissions, 'plugin');
    // createDeniedService returns a Proxy that throws synchronously on any property access
    expect(() => governed.llm.complete).toThrow(PermissionError);
  });

  it('allows llm access when permission is true', async () => {
    const raw = createMockPlatform();
    (raw.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const permissions: PermissionSpec = { platform: { llm: true } };
    const governed = applyPluginGovernance(raw, permissions, 'plugin');
    const result = await governed.llm.complete('prompt');
    expect(result).toBe('ok');
  });

  it('denies cache access when permission is missing', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = { platform: {} };
    const governed = applyPluginGovernance(raw, permissions, 'plugin');
    // No cache permission → createDeniedService Proxy → throws synchronously on any property access
    expect(() => governed.cache.get).toThrow(PermissionError);
  });

  it('applies adapter middlewares before governance', async () => {
    const raw = createMockPlatform();
    (raw.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue('raw');
    const permissions: PermissionSpec = { platform: { llm: true } };

    const calls: string[] = [];
    const adapterMw = {
      decl: { id: 'test', handler: '', target: 'llm', slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (prompt: string, opts?: unknown) => {
          calls.push('adapter-mw');
          return adapter.complete(prompt, opts as never);
        },
        stream: adapter.stream,
      }),
    };

    const governed = applyPluginGovernance(raw, permissions, 'plugin', [adapterMw]);
    await governed.llm.complete('prompt');
    expect(calls).toContain('adapter-mw');
  });

  it('pass-through adapters are unchanged (analytics)', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = {};
    const governed = applyPluginGovernance(raw, permissions, 'plugin');
    // analytics has strategy pass-through, so should be the same reference
    expect(governed.analytics).toBe(raw.analytics);
  });
});

describe('applyPluginGovernance — middleware ordering', () => {
  it('applies middlewares in slot order (post-router before post-resource-broker)', async () => {
    const raw = createMockPlatform();
    (raw.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue('raw');
    const permissions: PermissionSpec = { platform: { llm: true } };
    const order: string[] = [];

    const mwPostResourceBroker = {
      decl: { id: 'b', handler: '', target: 'llm', slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (p: string, o?: unknown) => {
          order.push('post-resource-broker');
          return adapter.complete(p, o as never);
        },
        stream: adapter.stream,
      }),
    };

    const mwPostRouter = {
      decl: { id: 'a', handler: '', target: 'llm', slot: 'post-router' as const },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (p: string, o?: unknown) => {
          order.push('post-router');
          return adapter.complete(p, o as never);
        },
        stream: adapter.stream,
      }),
    };

    const governed = applyPluginGovernance(raw, permissions, 'plugin', [mwPostResourceBroker, mwPostRouter]);
    await governed.llm.complete('prompt');
    // post-router applied first (innermost) → called last. post-resource-broker outermost → called first.
    expect(order).toEqual(['post-resource-broker', 'post-router']);
  });

  it('applies middlewares in priority order within the same slot (higher priority = outer wrapper = runs first on call)', async () => {
    const raw = createMockPlatform();
    (raw.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue('raw');
    const permissions: PermissionSpec = { platform: { llm: true } };
    const order: string[] = [];

    const makeMw = (id: string, priority: number) => ({
      decl: { id, handler: '', target: 'llm', slot: 'post-resource-broker' as const, priority },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (p: string, o?: unknown) => {
          order.push(id);
          return adapter.complete(p, o as never);
        },
        stream: adapter.stream,
      }),
    });

    const governed = applyPluginGovernance(raw, permissions, 'plugin', [
      makeMw('priority-20', 20),
      makeMw('priority-5', 5),
      makeMw('priority-10', 10),
    ]);
    await governed.llm.complete('prompt');
    // priority-5 is innermost (applied first in wrapping), runs last on call.
    // priority-20 is outermost (applied last in wrapping), intercepts first on call.
    expect(order).toEqual(['priority-20', 'priority-10', 'priority-5']);
  });

  it('governance (system) runs after all adapter middlewares', async () => {
    const raw = createMockPlatform();
    (raw.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue('raw');
    const permissions: PermissionSpec = { platform: { llm: true } };
    const order: string[] = [];

    const mw = {
      decl: { id: 'mw', handler: '', target: 'llm', slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (p: string, o?: unknown) => {
          order.push('adapter-mw');
          return adapter.complete(p, o as never);
        },
        stream: adapter.stream,
      }),
    };

    const governed = applyPluginGovernance(raw, permissions, 'plugin', [mw]);
    await governed.llm.complete('prompt');
    // Middleware must run before governance; governance wraps the whole chain
    expect(order).toContain('adapter-mw');
    expect((raw.llm.complete as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});

describe('applyPluginGovernance — lifecycle hooks', () => {
  it('lifecycle object is passed into middleware context', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = { platform: { llm: true } };
    const lifecycle = { onReady: vi.fn(), onDispose: vi.fn(), on: vi.fn() };
    const capturedCtx: unknown[] = [];

    const mw = {
      decl: { id: 'mw', handler: '', target: 'llm', slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], ctx: unknown) => {
        capturedCtx.push(ctx);
        return adapter;
      },
    };

    applyPluginGovernance(raw, permissions, 'plugin', [mw], lifecycle);
    expect(capturedCtx[0]).toMatchObject({ lifecycle });
  });

  it('onReady and onDispose registered by middleware are accessible', () => {
    const raw = createMockPlatform();
    const permissions: PermissionSpec = { platform: { llm: true } };
    const readyCb = vi.fn();
    const disposeCb = vi.fn();
    const lifecycle = { onReady: vi.fn(), onDispose: vi.fn(), on: vi.fn() };

    const mw = {
      decl: { id: 'mw', handler: '', target: 'llm', slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], ctx: MiddlewareContext) => {
        ctx.lifecycle.onReady(readyCb);
        ctx.lifecycle.onDispose(disposeCb);
        return adapter;
      },
    };

    applyPluginGovernance(raw, permissions, 'plugin', [mw], lifecycle);
    expect(lifecycle.onReady).toHaveBeenCalledWith(readyCb);
    expect(lifecycle.onDispose).toHaveBeenCalledWith(disposeCb);
  });
});

describe('assemblePlatform', () => {
  it('skips routerFactory when config key is absent, but applies analyticsFactory and resourceBrokerFactory', () => {
    const raw = createMockPlatform();
    const broker = {} as never;

    // routerFactory requires config[key] to be present — skipped when config is empty.
    // analyticsFactory and resourceBrokerFactory have no such requirement — always applied.
    const config: PlatformConfig = {};
    const result = assemblePlatform(raw, config, broker);

    // llm is transformed by analyticsFactory + resourceBrokerFactory → not the same reference
    expect(result.llm).not.toBe(raw.llm);
    // cache is transformed by analyticsFactory (analytics present in mock) → not the same reference
    expect(result.cache).not.toBe(raw.cache);
    // eventBus has no factories at all → returned as-is
    expect(result.eventBus).toBe(raw.eventBus);
  });

  it('returns a new object (does not mutate raw)', () => {
    const raw = createMockPlatform();
    const config: PlatformConfig = {};
    const broker = {} as never;
    const result = assemblePlatform(raw, config, broker);
    expect(result).not.toBe(raw);
  });

  it('skips adapters that are undefined in raw platform', () => {
    const raw = createMockPlatform();
    // Remove an optional adapter
    (raw as unknown as Record<string, unknown>)['notifier'] = undefined;
    const config: PlatformConfig = {};
    expect(() => assemblePlatform(raw, config, {} as never)).not.toThrow();
  });
});
