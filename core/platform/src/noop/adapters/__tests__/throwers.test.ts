/**
 * @module @kb-labs/core-platform/noop/adapters/__tests__/throwers
 *
 * Behavioural tests for the NoOp adapter throwers — they should throw
 * `AdapterUnavailableError` from every functional call, with the slot
 * name attached for clean error reporting.
 */

import { describe, it, expect } from 'vitest';
import { AdapterUnavailableError } from '../../../errors.js';
import { NoOpLLM } from '../llm.js';
import { NoOpEmbeddings } from '../embeddings.js';
import { NoOpNotifier } from '../notifier.js';
import { NoOpLogReader } from '../log-reader.js';
import { noopFactories } from '../../index.js';

describe('NoOpLLM', () => {
  const llm = new NoOpLLM();

  it('complete() throws AdapterUnavailableError with slot=llm', async () => {
    await expect(llm.complete('hi')).rejects.toBeInstanceOf(AdapterUnavailableError);
    try {
      await llm.complete('hi');
    } catch (err) {
      expect((err as AdapterUnavailableError).slot).toBe('llm');
      expect((err as AdapterUnavailableError).reason).toBe('not-configured');
    }
  });

  it('stream() throws on iteration', async () => {
    const iter = llm.stream('hi');
    let caught: unknown;
    try {
      for await (const _ of iter) { void _; }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdapterUnavailableError);
  });

  it('chatWithTools() throws AdapterUnavailableError', async () => {
    await expect(llm.chatWithTools!([], { tools: [] })).rejects.toBeInstanceOf(
      AdapterUnavailableError,
    );
  });
});

describe('NoOpEmbeddings', () => {
  const embed = new NoOpEmbeddings();

  it('embed() throws AdapterUnavailableError with slot=embeddings', async () => {
    try {
      await embed.embed('hello');
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterUnavailableError);
      expect((err as AdapterUnavailableError).slot).toBe('embeddings');
    }
  });

  it('embedBatch() throws', async () => {
    await expect(embed.embedBatch(['a', 'b'])).rejects.toBeInstanceOf(
      AdapterUnavailableError,
    );
  });

  it('getDimensions() throws', async () => {
    await expect(embed.getDimensions()).rejects.toBeInstanceOf(AdapterUnavailableError);
  });
});

describe('NoOpNotifier', () => {
  const notifier = new NoOpNotifier();

  it('notify() does NOT throw — silent drop is the contract', async () => {
    await expect(
      notifier.notify({
        severity: 'info',
        type: 'test.event',
        title: 'hi',
        message: 'msg',
      }),
    ).resolves.toBeUndefined();
  });

  it('subscribe() returns a no-op unsubscribe function', () => {
    const unsub = notifier.subscribe({}, async () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

describe('NoOpLogReader', () => {
  const reader = new NoOpLogReader();

  it('query() returns an empty result, never throws', async () => {
    const result = await reader.query({});
    expect(result.logs).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('getById() returns null', async () => {
    expect(await reader.getById('any-id')).toBeNull();
  });

  it('getCapabilities() reports no backends', () => {
    const caps = reader.getCapabilities();
    expect(caps.hasBuffer).toBe(false);
    expect(caps.hasPersistence).toBe(false);
    expect(caps.hasStreaming).toBe(false);
    expect(caps.hasSearch).toBe(false);
  });
});

describe('noopFactories', () => {
  it('provides factories for slots whose defaultFallback is noop', () => {
    expect(noopFactories.llm).toBeDefined();
    expect(noopFactories.embeddings).toBeDefined();
    expect(noopFactories.notifier).toBeDefined();
    expect(noopFactories.logs).toBeDefined();
  });

  it('factory returns a fresh instance each call', () => {
    const a = noopFactories.llm();
    const b = noopFactories.llm();
    expect(a).toBeInstanceOf(NoOpLLM);
    expect(b).toBeInstanceOf(NoOpLLM);
    expect(a).not.toBe(b);
  });
});
