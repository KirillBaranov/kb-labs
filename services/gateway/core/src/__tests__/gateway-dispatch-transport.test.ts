import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayDispatchTransport } from '../transport/gateway-dispatch-transport.js';
import type { ExecutionRequest } from '@kb-labs/core-contracts';

const DEFAULT_OPTS = {
  dispatchEndpoint: 'http://localhost:4000/internal/dispatch',
  internalSecret: 'test-secret',
  runtimeHostId: 'host_runtime_abc',
};

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: 'exec-001',
    handlerRef: '/workspace/dist/handler.js',
    pluginRoot: '/workspace',
    input: { key: 'value' },
    descriptor: {},
    ...overrides,
  };
}

describe('GatewayDispatchTransport', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to dispatchEndpoint with correct headers and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { answer: 42 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    const result = await transport.execute(makeRequest());

    expect(result.data).toEqual({ answer: 42 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/internal/dispatch');
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe('test-secret');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends correct body with adapter:execution, method:execute, args:[request]', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new GatewayDispatchTransport({ ...DEFAULT_OPTS, namespaceId: 'ns_prod' });
    const request = makeRequest();
    await transport.execute(request);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body['hostId']).toBe('host_runtime_abc');
    expect(body['namespaceId']).toBe('ns_prod');
    expect(body['adapter']).toBe('execution');
    expect(body['method']).toBe('execute');
    expect((body['args'] as unknown[])[0]).toMatchObject({
      executionId: 'exec-001',
      handlerRef: '/workspace/dist/handler.js',
    });
  });

  it('throws on HTTP 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    await expect(transport.execute(makeRequest())).rejects.toThrow('503');
  });

  it('throws on HTTP 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }));

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    await expect(transport.execute(makeRequest())).rejects.toThrow('403');
  });

  it('throws when fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    await expect(transport.execute(makeRequest())).rejects.toThrow('ECONNREFUSED');
  });

  it('returns data from response.result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { files: ['a.ts', 'b.ts'] } }),
    }));

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    const result = await transport.execute(makeRequest());
    expect(result.data).toEqual({ files: ['a.ts', 'b.ts'] });
  });

  it('returns data: undefined when result field is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
    const result = await transport.execute(makeRequest());
    expect(result.data).toBeUndefined();
  });

  describe('retryOn503', () => {
    it('retries on 503 and succeeds on next attempt', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'No host' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'ok' }) });
      vi.stubGlobal('fetch', fetchMock);

      const transport = new GatewayDispatchTransport({
        ...DEFAULT_OPTS,
        retryOn503: { maxAttempts: 3, delayMs: 0 },
      });
      const result = await transport.execute(makeRequest());

      expect(result.data).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retry attempts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 503, text: async () => 'No host available',
      }));

      const transport = new GatewayDispatchTransport({
        ...DEFAULT_OPTS,
        retryOn503: { maxAttempts: 3, delayMs: 0 },
      });
      await expect(transport.execute(makeRequest())).rejects.toThrow('503');
    });

    it('does not retry on 503 when retryOn503 is not set', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false, status: 503, text: async () => 'No host',
      });
      vi.stubGlobal('fetch', fetchMock);

      const transport = new GatewayDispatchTransport(DEFAULT_OPTS);
      await expect(transport.execute(makeRequest())).rejects.toThrow('503');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries correct number of times before success', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { done: true } }) });
      vi.stubGlobal('fetch', fetchMock);

      const transport = new GatewayDispatchTransport({
        ...DEFAULT_OPTS,
        retryOn503: { maxAttempts: 5, delayMs: 0 },
      });
      const result = await transport.execute(makeRequest());

      expect(result.data).toEqual({ done: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not retry on other 4xx/5xx errors', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false, status: 502, text: async () => 'Bad Gateway',
      });
      vi.stubGlobal('fetch', fetchMock);

      const transport = new GatewayDispatchTransport({
        ...DEFAULT_OPTS,
        retryOn503: { maxAttempts: 5, delayMs: 0 },
      });
      await expect(transport.execute(makeRequest())).rejects.toThrow('502');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
