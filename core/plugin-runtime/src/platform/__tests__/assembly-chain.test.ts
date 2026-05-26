/**
 * Structural tests for assemblePlatform() — verifies wrapper chain via instanceof.
 *
 * These tests check which wrappers are applied and in which positions,
 * without executing real LLM calls. A simple mock broker (vi.fn()) is used —
 * no executor registered, only structural presence needed.
 *
 * Stage order (after pipeline.ts fix):
 *   raw → resourceBrokerFactory → analyticsFactory → routerFactory → postAssemblyFactory
 * Resulting chain (outermost first):
 *   PIIRedaction(LLMRouter(AnalyticsLLM(QueuedLLM(broker, raw))))
 */

import { describe, it, expect, vi } from 'vitest';
import { assemblePlatform } from '../pipeline.js';
import type { PlatformConfig } from '../pipeline.js';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import {
  AnalyticsLLM,
  AnalyticsEmbeddings,
  AnalyticsVectorStore,
  AnalyticsCache,
  AnalyticsStorage,
  PIIRedactionLLM,
} from '@kb-labs/core-platform';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { LLMRouter } from '@kb-labs/llm-router';
import { mockLLM, mockLogger } from '@kb-labs/shared-testing';

// ─── Mock broker (structural only — no executor needed for instanceof checks) ─

function makeMockBroker(): IResourceBroker {
  return {
    register: vi.fn(),
    registerLimit: vi.fn(),
    enqueue: vi.fn(async () => ({
      success: true as const,
      data: { content: 'ok', usage: { promptTokens: 1, completionTokens: 1 }, model: 'gpt-4o' },
      retries: 0,
      waitTime: 0,
      processingTime: 0,
      totalTime: 0,
    })) as unknown as IResourceBroker['enqueue'],
    tryAcquire: vi.fn(async () => ({
      allowed: false,
      release: async () => {},
    })),
    getStats: vi.fn(() => ({
      resources: {},
      totalRequests: 0,
      totalSuccess: 0,
      totalErrors: 0,
      queueSize: 0,
      uptime: 0,
    })),
    shutdown: vi.fn(async () => {}),
    isShuttingDown: vi.fn(() => false),
  };
}

function createMockPlatform(): PlatformServices {
  return {
    logger: mockLogger(),
    llm: mockLLM() as unknown as PlatformServices['llm'],
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
    cache: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
      zadd: vi.fn(async () => {}),
      zrangebyscore: vi.fn(async () => []),
      zrem: vi.fn(async () => {}),
      setIfNotExists: vi.fn(async () => false),
    } as unknown as PlatformServices['cache'],
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
    documentDatabase: {} as PlatformServices['documentDatabase'],
    kvStore: {} as PlatformServices['kvStore'],
    logs: {} as PlatformServices['logs'],
  };
}

// ─── LLM chain structure ──────────────────────────────────────────────────────

describe('assemblePlatform — LLM chain structure', () => {
  it('AnalyticsLLM is the outermost wrapper when no router config is given', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.llm).toBeInstanceOf(AnalyticsLLM);
  });

  it('QueuedLLM is in the chain — broker.enqueue is called for complete()', async () => {
    const raw = createMockPlatform();
    const broker = makeMockBroker();
    const result = assemblePlatform(raw, {}, broker);
    await result.llm.complete('test');
    expect(broker.enqueue).toHaveBeenCalled();
  });

  it('includes LLMRouter as outermost (before PII) when config.llm is provided', () => {
    const raw = createMockPlatform();
    const config: PlatformConfig = { llm: { defaultTier: 'small' } };
    const result = assemblePlatform(raw, config, makeMockBroker());
    expect(result.llm).toBeInstanceOf(LLMRouter);
  });

  it('includes PIIRedactionLLM as outermost when privacy config is provided', () => {
    const raw = createMockPlatform();
    const config: PlatformConfig = {
      llm: {
        defaultTier: 'small',
        _privacy: { enabled: true, mode: 'replace', entities: ['email', 'phone'] },
      },
    };
    const result = assemblePlatform(raw, config, makeMockBroker());
    expect(result.llm).toBeInstanceOf(PIIRedactionLLM);
  });

  it('skips LLMRouter when config.llm is absent', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.llm).not.toBeInstanceOf(LLMRouter);
  });

  it('skips PIIRedactionLLM when _privacy is absent from config', () => {
    const raw = createMockPlatform();
    const config: PlatformConfig = { llm: { defaultTier: 'small' } };
    const result = assemblePlatform(raw, config, makeMockBroker());
    expect(result.llm).not.toBeInstanceOf(PIIRedactionLLM);
  });

  it('skips PIIRedactionLLM when _privacy.enabled is false', () => {
    const raw = createMockPlatform();
    const config: PlatformConfig = {
      llm: { defaultTier: 'small', _privacy: { enabled: false } },
    };
    const result = assemblePlatform(raw, config, makeMockBroker());
    expect(result.llm).not.toBeInstanceOf(PIIRedactionLLM);
  });
});

// ─── Embeddings + VectorStore + Cache + Storage structure ─────────────────────

describe('assemblePlatform — embeddings chain structure', () => {
  it('AnalyticsEmbeddings is the outermost wrapper', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.embeddings).toBeInstanceOf(AnalyticsEmbeddings);
  });

  it('QueuedEmbeddings is in the chain — broker.enqueue is called for embed()', async () => {
    const raw = createMockPlatform();
    const broker = makeMockBroker();
    const result = assemblePlatform(raw, {}, broker);
    await result.embeddings.embed('test');
    expect(broker.enqueue).toHaveBeenCalled();
  });
});

describe('assemblePlatform — vectorStore chain structure', () => {
  it('AnalyticsVectorStore is the outermost wrapper', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.vectorStore).toBeInstanceOf(AnalyticsVectorStore);
  });

  it('QueuedVectorStore is in the chain — broker.enqueue is called for search()', async () => {
    const raw = createMockPlatform();
    const broker = makeMockBroker();
    const result = assemblePlatform(raw, {}, broker);
    await result.vectorStore.search([1, 2, 3], 10);
    expect(broker.enqueue).toHaveBeenCalled();
  });
});

describe('assemblePlatform — cache chain structure', () => {
  it('includes AnalyticsCache (no queuing for cache)', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.cache).toBeInstanceOf(AnalyticsCache);
  });
});

describe('assemblePlatform — storage chain structure', () => {
  it('includes AnalyticsStorage (no queuing for storage)', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.storage).toBeInstanceOf(AnalyticsStorage);
  });
});

// ─── Pass-through adapters ────────────────────────────────────────────────────

describe('assemblePlatform — pass-through adapters', () => {
  it('analytics adapter is unchanged (pass-through strategy)', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.analytics).toBe(raw.analytics);
  });

  it('eventBus adapter is unchanged (pass-through strategy)', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.eventBus).toBe(raw.eventBus);
  });

  it('logger adapter is unchanged by assemblePlatform (governance wraps per-plugin)', () => {
    const raw = createMockPlatform();
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result.logger).toBe(raw.logger);
  });
});

// ─── Safety invariants ────────────────────────────────────────────────────────

describe('assemblePlatform — safety invariants', () => {
  it('returns a new object, does not mutate raw platform', () => {
    const raw = createMockPlatform();
    const originalLLM = raw.llm;
    const result = assemblePlatform(raw, {}, makeMockBroker());
    expect(result).not.toBe(raw);
    expect(raw.llm).toBe(originalLLM);
    expect(result.llm).not.toBe(originalLLM);
  });

  it('skips adapters that are undefined in raw platform', () => {
    const raw = createMockPlatform();
    (raw as unknown as Record<string, unknown>)['notifier'] = undefined;
    expect(() => assemblePlatform(raw, {}, makeMockBroker())).not.toThrow();
  });
});
