/**
 * Combined tests: assemblePlatform() → applyPluginGovernance()
 *
 * Verifies that governance correctly enforces permissions on top of an
 * already-assembled platform (i.e., after analytics+broker+router wrapping).
 */

import { describe, it, expect, vi } from 'vitest';
import { assemblePlatform, applyPluginGovernance } from '../pipeline.js';
import type { PlatformConfig } from '../pipeline.js';
import type { PlatformServices, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { mockLLM, mockLogger, mockCache } from '@kb-labs/shared-testing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockBroker(): IResourceBroker {
  return {
    register: vi.fn(),
    enqueue: vi.fn(async () => ({
      success: true as const,
      data: { content: 'assembled-ok', usage: { promptTokens: 1, completionTokens: 1 }, model: 'gpt-4o' },
      retries: 0,
      waitTime: 0,
      processingTime: 0,
      totalTime: 0,
    })) as unknown as IResourceBroker['enqueue'],
    getStats: vi.fn(() => ({ resources: {}, totalRequests: 0, totalSuccess: 0, totalErrors: 0, queueSize: 0, uptime: 0 })),
    shutdown: vi.fn(async () => {}),
    isShuttingDown: vi.fn(() => false),
  };
}

function createMockPlatform(): PlatformServices {
  const llm = mockLLM().onAnyComplete().respondWith('raw ok');
  return {
    logger: mockLogger(),
    llm: llm as unknown as PlatformServices['llm'],
    analytics: {
      track: vi.fn(async () => {}),
      identify: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
    } as unknown as PlatformServices['analytics'],
    embeddings: {
      embed: vi.fn(async () => []),
      embedBatch: vi.fn(async () => [[]]),
      getDimensions: vi.fn(async () => 1536),
    } as unknown as PlatformServices['embeddings'],
    vectorStore: {
      search: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      count: vi.fn(async () => 0),
    } as unknown as PlatformServices['vectorStore'],
    cache: mockCache() as unknown as PlatformServices['cache'],
    storage: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      exists: vi.fn(async () => false),
      list: vi.fn(async () => []),
    } as unknown as PlatformServices['storage'],
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as PlatformServices['eventBus'],
    config: {} as PlatformServices['config'],
    invoke: {
      call: vi.fn(async () => ({ success: false, error: 'noop' })),
      isAvailable: vi.fn(async () => false),
    } as unknown as PlatformServices['invoke'],
    sqlDatabase: {} as PlatformServices['sqlDatabase'],
    documentDatabase: {} as PlatformServices['documentDatabase'],
    logs: {} as PlatformServices['logs'],
  };
}

function assembleAndGovern(
  raw: PlatformServices,
  config: PlatformConfig,
  broker: IResourceBroker,
  permissions: PermissionSpec,
  pluginId = 'test-plugin',
): PlatformServices {
  const assembled = assemblePlatform(raw, config, broker);
  return applyPluginGovernance(assembled, permissions, pluginId);
}

// ─── LLM access control ──────────────────────────────────────────────────────

describe('governance on assembled platform — LLM access control', () => {
  it('denies llm access when permission is false', () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), { platform: { llm: false } });
    expect(() => governed.llm.complete).toThrow(PermissionError);
  });

  it('denies llm access when platform permission is absent', () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), {});
    expect(() => governed.llm.complete).toThrow(PermissionError);
  });

  it('allows llm call through full assembled chain when permission is true', async () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), { platform: { llm: true } });
    const result = await governed.llm.complete('hello');
    expect(result.content).toBe('assembled-ok');
  });

  it('enforces model allowlist on assembled+governed llm', async () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), {
      platform: { llm: { models: ['gpt-4o-mini'] } },
    });
    await expect(governed.llm.complete('hi', { model: 'gpt-4o' })).rejects.toThrow(PermissionError);
  });
});

// ─── Cache access control ─────────────────────────────────────────────────────

describe('governance on assembled platform — cache access control', () => {
  it('denies cache access when permission is absent', () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), { platform: {} });
    expect(() => governed.cache.get).toThrow(PermissionError);
  });

  it('enforces cache namespace on assembled+governed cache', async () => {
    const raw = createMockPlatform();
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), {
      platform: { cache: { namespaces: ['plugin:'] } },
    });
    await expect(governed.cache.get('other:key')).rejects.toThrow(PermissionError);
  });
});

// ─── Logger and analytics ─────────────────────────────────────────────────────

describe('governance on assembled platform — logger and analytics', () => {
  it('governance creates child logger with pluginId on assembled platform', () => {
    const raw = createMockPlatform();
    // Spy on child() before governance runs
    const childSpy = vi.spyOn(raw.logger, 'child');
    const governed = assembleAndGovern(raw, {}, makeMockBroker(), {}, 'my-plugin');
    expect(childSpy).toHaveBeenCalledWith({ plugin: 'my-plugin' });
    expect(governed.logger).not.toBe(raw.logger);
  });

  it('analytics is unchanged after governance (pass-through)', () => {
    const raw = createMockPlatform();
    const assembled = assemblePlatform(raw, {}, makeMockBroker());
    const governed = applyPluginGovernance(assembled, {}, 'plugin');
    expect(governed.analytics).toBe(assembled.analytics);
  });
});

// ─── Middleware interaction ───────────────────────────────────────────────────

describe('governance on assembled platform — middleware interaction', () => {
  it('adapter middleware runs before governance on assembled platform', async () => {
    const raw = createMockPlatform();
    const assembled = assemblePlatform(raw, {}, makeMockBroker());

    const order: string[] = [];
    const mw = {
      decl: { id: 'spy', handler: '', target: 'llm' as const, slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], _ctx: unknown) => ({
        ...adapter,
        complete: async (prompt: string, opts?: unknown) => {
          order.push('middleware');
          return adapter.complete(prompt, opts as never);
        },
        stream: adapter.stream,
      }),
    };

    const governed = applyPluginGovernance(assembled, { platform: { llm: true } }, 'plugin', [mw]);
    await governed.llm.complete('test');

    expect(order).toContain('middleware');
  });

  it('middleware receives lifecycle context from applyPluginGovernance', () => {
    const raw = createMockPlatform();
    const assembled = assemblePlatform(raw, {}, makeMockBroker());

    const lifecycle = { onReady: vi.fn(), onDispose: vi.fn(), on: vi.fn() };
    const capturedCtx: unknown[] = [];

    const mw = {
      decl: { id: 'ctx-spy', handler: '', target: 'llm' as const, slot: 'post-resource-broker' as const },
      fn: (adapter: PlatformServices['llm'], ctx: unknown) => {
        capturedCtx.push(ctx);
        return adapter;
      },
    };

    applyPluginGovernance(assembled, { platform: { llm: true } }, 'plugin', [mw], lifecycle);
    expect(capturedCtx[0]).toMatchObject({ lifecycle });
  });
});
