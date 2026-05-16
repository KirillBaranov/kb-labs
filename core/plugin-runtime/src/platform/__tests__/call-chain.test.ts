/**
 * Call-chain integration tests for the platform adapter pipeline.
 *
 * These tests verify that analytics tracking and resource-broker queuing
 * interact correctly when QueuedLLM is in the chain.
 *
 * Key insight: QueuedLLM.complete() routes through broker.enqueue() → executor,
 * NOT through this.realLLM.complete(). The executor is registered with the raw
 * adapter BEFORE assemblePlatform() is called (mirroring initializeResourceBroker).
 *
 * Bug (BEFORE fix in pipeline.ts):
 *   Stage order analytics → router → broker produces:
 *     PIIRedaction(QueuedLLM(LLMRouter(AnalyticsLLM(raw))))
 *   When complete() is called: PIIRedaction → QueuedLLM → broker → executor → raw
 *   AnalyticsLLM is skipped entirely! analytics.track is never called.
 *
 * After fix (broker → analytics → router → PII):
 *   PIIRedaction(LLMRouter(AnalyticsLLM(QueuedLLM(broker, raw))))
 *   When complete() is called: PIIRedaction → LLMRouter → AnalyticsLLM → QueuedLLM → broker → executor → raw
 *   Full chain executes correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assemblePlatform } from '../pipeline.js';
import type { PlatformConfig } from '../pipeline.js';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import type { IAnalytics, ILLM } from '@kb-labs/core-platform';
import { AnalyticsLLM } from '@kb-labs/core-platform';
import {
  ResourceBroker,
  InMemoryRateLimitBackend,
  createQueuedLLM,
} from '@kb-labs/core-resource-broker';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { mockLLM, mockLogger } from '@kb-labs/shared-testing';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnalyticsMock(): IAnalytics & { track: ReturnType<typeof vi.fn> } {
  return {
    track: vi.fn(async () => {}),
    identify: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
  };
}

function createMinimalPlatform(
  llm: PlatformServices['llm'],
  analytics: IAnalytics,
): PlatformServices {
  const logger = mockLogger();
  return {
    logger: logger,
    llm,
    analytics: analytics as unknown as PlatformServices['analytics'],
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
    sqlDatabase: {} as PlatformServices['sqlDatabase'],
    documentDatabase: {} as PlatformServices['documentDatabase'],
    logs: {} as PlatformServices['logs'],
  };
}

// ─── Setup: real broker with executor registered BEFORE assembly ──────────────
//
// This mirrors initializeResourceBroker in loader.ts:
//   broker.register('llm', { executor: (op, args) => container.llm.complete(...) })
// The executor captures the raw adapter — assembly happens afterwards.

describe('call-chain: complete() path', () => {
  let rawLlm: ReturnType<typeof mockLLM>;
  let analyticsMock: ReturnType<typeof makeAnalyticsMock>;
  let broker: ResourceBroker;
  let assembled: PlatformServices;

  beforeEach(() => {
    rawLlm = mockLLM().onAnyComplete().respondWith({
      content: 'response from raw',
      usage: { promptTokens: 10, completionTokens: 5 },
      model: 'gpt-4o',
    });
    analyticsMock = makeAnalyticsMock();

    broker = new ResourceBroker(new InMemoryRateLimitBackend());

    // Executor registered BEFORE assembly — captures rawLlm directly.
    // This is the critical setup that triggers the bug in wrong stage order.
    broker.register('llm', {
      rateLimits: {},
      maxRetries: 0,
      timeout: 5000,
      executor: async (operation: string, args: unknown[]) => {
        if (operation === 'complete') {
          return rawLlm.complete(args[0] as string, args[1] as never);
        }
        throw new Error(`Unknown operation: ${operation}`);
      },
    });

    const raw = createMinimalPlatform(
      rawLlm as unknown as PlatformServices['llm'],
      analyticsMock,
    );

    const config: PlatformConfig = {};
    assembled = assemblePlatform(raw, config, broker as unknown as IResourceBroker);
  });

  it('complete() calls raw.complete exactly once', async () => {
    await assembled.llm.complete('hello');
    expect(rawLlm.complete).toHaveBeenCalledTimes(1);
  });

  it('complete() returns the raw adapter response', async () => {
    const result = await assembled.llm.complete('hello');
    expect(result.content).toBe('response from raw');
    expect(result.model).toBe('gpt-4o');
  });

  it('analytics.track IS called for complete() — fails before pipeline.ts fix', async () => {
    // BUG: With wrong stage order (analytics → broker), QueuedLLM.complete() routes through
    // broker.enqueue → executor → raw directly, bypassing AnalyticsLLM entirely.
    // After fix (broker → analytics), AnalyticsLLM wraps QueuedLLM, so track() IS called.
    await assembled.llm.complete('hello');
    expect(analyticsMock.track).toHaveBeenCalled();
  });

  it('analytics.track called with llm.completion.started event', async () => {
    await assembled.llm.complete('hello');
    const eventNames = analyticsMock.track.mock.calls.map((c) => c[0] as string);
    expect(eventNames).toContain('llm.completion.started');
  });

  it('analytics.track called with llm.completion.completed event', async () => {
    await assembled.llm.complete('hello');
    const eventNames = analyticsMock.track.mock.calls.map((c) => c[0] as string);
    expect(eventNames).toContain('llm.completion.completed');
  });

  it('raw.complete called exactly once — no double invocation', async () => {
    await assembled.llm.complete('test prompt');
    expect(rawLlm.complete).toHaveBeenCalledTimes(1);
  });

  it('analytics.track called exactly once per event type — no double wrapping', async () => {
    await assembled.llm.complete('test prompt');
    const startedCount = analyticsMock.track.mock.calls.filter((c) => c[0] === 'llm.completion.started').length;
    expect(startedCount).toBe(1);
  });
});

describe('call-chain: stream() path', () => {
  let rawLlm: ReturnType<typeof mockLLM>;
  let analyticsMock: ReturnType<typeof makeAnalyticsMock>;
  let assembled: PlatformServices;

  beforeEach(() => {
    rawLlm = mockLLM().streaming(['chunk1', 'chunk2']);
    analyticsMock = makeAnalyticsMock();

    const broker = new ResourceBroker(new InMemoryRateLimitBackend());
    broker.register('llm', {
      rateLimits: {},
      maxRetries: 0,
      timeout: 5000,
      executor: async (operation: string, args: unknown[]) => {
        if (operation === 'complete') return rawLlm.complete(args[0] as string, args[1] as never);
        throw new Error(`Unknown: ${operation}`);
      },
    });

    const raw = createMinimalPlatform(
      rawLlm as unknown as PlatformServices['llm'],
      analyticsMock,
    );
    assembled = assemblePlatform(raw, {}, broker as unknown as IResourceBroker);
  });

  it('stream() produces chunks from raw adapter', async () => {
    const chunks: string[] = [];
    for await (const chunk of assembled.llm.stream('hello')) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });

  it('analytics.track called for stream() (AnalyticsLLM wraps stream path)', async () => {
    for await (const _ of assembled.llm.stream('hello')) { /* drain */ }
    expect(analyticsMock.track).toHaveBeenCalled();
    const eventNames = analyticsMock.track.mock.calls.map((c) => c[0] as string);
    expect(eventNames).toContain('llm.stream.started');
    expect(eventNames).toContain('llm.stream.completed');
  });
});

describe('call-chain: broker enqueue mechanics', () => {
  it('executor captures the adapter as registered, not as assembled — root cause of the bug', async () => {
    // Documents the exact mechanism causing the stage-order bug:
    //
    // Wrong order (analytics → broker): executor registered with rawLlm BEFORE analytics wraps it.
    //   QueuedLLM.complete() calls broker → executor → rawLlm.complete() directly.
    //   AnalyticsLLM.complete() is never reached.
    //
    // Correct order (broker → analytics): AnalyticsLLM wraps QueuedLLM from outside.
    //   AnalyticsLLM.complete() calls QueuedLLM.complete() → broker → executor → rawLlm.
    //   Analytics runs for every complete() call.

    const rawLlm = mockLLM().onAnyComplete().respondWith('ok');
    const trackFn = vi.fn(async () => {});
    const analyticsMock: IAnalytics = { track: trackFn, identify: vi.fn(), flush: vi.fn() };

    const broker = new ResourceBroker(new InMemoryRateLimitBackend());
    broker.register('llm', {
      rateLimits: {},
      maxRetries: 0,
      timeout: 5000,
      executor: async (operation: string, args: unknown[]) => {
        if (operation === 'complete') return rawLlm.complete(args[0] as string, args[1] as never);
        throw new Error(`Unknown: ${operation}`);
      },
    });

    // Wrong order: analytics wraps raw, then broker wraps analytics
    const analyticsWrapped = new AnalyticsLLM(
      rawLlm as unknown as ILLM,
      analyticsMock,
    );
    const queuedOnTop = createQueuedLLM(
      broker as unknown as IResourceBroker,
      analyticsWrapped,
    );

    await queuedOnTop.complete('test');
    expect(trackFn).not.toHaveBeenCalled(); // analytics bypassed!
    expect(rawLlm.complete).toHaveBeenCalledTimes(1);

    // Correct order: broker wraps raw, then analytics wraps broker
    vi.clearAllMocks();
    rawLlm.resetCalls();
    const queuedFirst = createQueuedLLM(
      broker as unknown as IResourceBroker,
      rawLlm as unknown as ILLM,
    );
    const analyticsOutside = new AnalyticsLLM(queuedFirst, analyticsMock);

    await analyticsOutside.complete('test');
    expect(trackFn).toHaveBeenCalled(); // analytics fires correctly
    expect(rawLlm.complete).toHaveBeenCalledTimes(1);
  });
});
