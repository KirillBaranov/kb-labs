/**
 * Unit tests for createProxyPlatform.
 *
 * Tests:
 * - Returns IPlatformAdapters-compatible object with all required fields
 * - Proxy adapters forward calls via transport.send()
 * - Correct AdapterCall structure (adapter name, method, serialized args)
 * - Logger is local (not proxied)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProxyPlatform } from '../proxy/create-proxy-platform';
import type { ITransport } from '../transport/transport';
import type { AdapterCall, AdapterResponse } from '@kb-labs/core-platform/serializable';
import { IPC_PROTOCOL_VERSION } from '@kb-labs/core-platform/serializable';

function createMockTransport(): ITransport & { calls: AdapterCall[] } {
  const calls: AdapterCall[] = [];
  return {
    calls,
    send: vi.fn(async (call: AdapterCall): Promise<AdapterResponse> => {
      calls.push(call);
      return {
        type: 'adapter:response',
        requestId: call.requestId,
        result: null, // Simulate noop response
      };
    }),
    close: vi.fn(async () => {}),
    isClosed: vi.fn(() => false),
  };
}

describe('createProxyPlatform', () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  describe('Structure', () => {
    it('should return object with all IPlatformAdapters fields', () => {
      const platform = createProxyPlatform({ transport });

      // All required fields must be present
      expect(platform.logger).toBeDefined();
      expect(platform.llm).toBeDefined();
      expect(platform.embeddings).toBeDefined();
      expect(platform.vectorStore).toBeDefined();
      expect(platform.cache).toBeDefined();
      expect(platform.storage).toBeDefined();
      expect(platform.analytics).toBeDefined();
      expect(platform.eventBus).toBeDefined();
      expect(platform.config).toBeDefined();
      expect(platform.invoke).toBeDefined();
      expect(platform.sqlDatabase).toBeDefined();
      expect(platform.documentDatabase).toBeDefined();
      expect(platform.logs).toBeDefined();
    });

    it('should use provided logger', () => {
      const customLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn() } as any;
      const platform = createProxyPlatform({ transport, logger: customLogger });
      expect(platform.logger).toBe(customLogger);
    });

    it('should use noop logger by default', () => {
      const platform = createProxyPlatform({ transport });
      // Noop logger should not throw
      platform.logger.info('test');
      platform.logger.error('test');
      expect(transport.send).not.toHaveBeenCalled(); // Logger is local, not proxied
    });
  });

  describe('LLM Proxy', () => {
    it('should forward complete() via transport', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.llm.complete('hello', { temperature: 0.7 });

      expect(transport.send).toHaveBeenCalledTimes(1);
      const call = transport.calls[0];
      expect(call.adapter).toBe('llm');
      expect(call.method).toBe('complete');
      expect(call.type).toBe('adapter:call');
      expect(call.version).toBe(IPC_PROTOCOL_VERSION);
    });
  });

  describe('Cache Proxy', () => {
    it('should forward get() via transport', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.cache.get('my-key');

      expect(transport.send).toHaveBeenCalledTimes(1);
      const call = transport.calls[0];
      expect(call.adapter).toBe('cache');
      expect(call.method).toBe('get');
    });

    it('should forward set() via transport', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.cache.set('key', 'value', 3600);

      const call = transport.calls[0];
      expect(call.adapter).toBe('cache');
      expect(call.method).toBe('set');
    });

    it('should forward sorted set operations', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.cache.zadd('zset', 1.0, 'member');

      const call = transport.calls[0];
      expect(call.adapter).toBe('cache');
      expect(call.method).toBe('zadd');
    });
  });

  describe('VectorStore Proxy', () => {
    it('should forward search() via transport', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.vectorStore.search([0.1, 0.2, 0.3], 10);

      const call = transport.calls[0];
      expect(call.adapter).toBe('vectorStore');
      expect(call.method).toBe('search');
    });
  });

  describe('Storage Proxy', () => {
    it('should forward read() via transport', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.storage.read('/path/to/file');

      const call = transport.calls[0];
      expect(call.adapter).toBe('storage');
      expect(call.method).toBe('read');
    });
  });

  describe('Noop Adapters', () => {
    it('should have noop analytics (no transport calls)', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.analytics.track('event', { key: 'value' });
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('should have noop eventBus (no transport calls)', async () => {
      const platform = createProxyPlatform({ transport });
      await platform.eventBus.publish('topic', { data: 1 });
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('should have noop logs (no transport calls)', async () => {
      const platform = createProxyPlatform({ transport });
      const result = await platform.logs.query({} as any);
      expect(result.logs).toEqual([]);
      expect(transport.send).not.toHaveBeenCalled();
    });
  });
});
