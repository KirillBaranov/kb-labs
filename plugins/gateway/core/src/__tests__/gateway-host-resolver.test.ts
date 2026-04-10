import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GatewayHostResolver } from '../resolver/gateway-host-resolver.js';
import type { ExecutionTarget } from '@kb-labs/core-contracts';

// Mock fetch globally
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeResolver(overrides?: Partial<ConstructorParameters<typeof GatewayHostResolver>[0]>) {
  return new GatewayHostResolver({
    gatewayUrl: 'http://localhost:4000',
    internalSecret: 'test-secret',
    timeoutMs: 1000,
    ...overrides,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('GatewayHostResolver', () => {
  it('resolves host from Gateway response', async () => {
    const resolver = makeResolver();
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      hostId: 'host-abc',
      strategy: 'any-matching',
      namespaceId: 'default',
    }));

    const target: ExecutionTarget = { type: 'workspace-agent', hostSelection: 'any-matching' };
    const result = await resolver.resolve(target);

    expect(result).toEqual({
      hostId: 'host-abc',
      strategy: 'any-matching',
      namespaceId: 'default',
    });

    // Verify request
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/internal/resolve-host');
    expect(opts.headers['x-internal-secret']).toBe('test-secret');
  });

  it('returns null on 404 (no host found)', async () => {
    const resolver = makeResolver();
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: 'No matching host' }));

    const result = await resolver.resolve({ type: 'workspace-agent' });
    expect(result).toBeNull();
  });

  it('returns null on 5xx (Gateway error)', async () => {
    const resolver = makeResolver();
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'Internal error' }));

    const result = await resolver.resolve({ type: 'workspace-agent' });
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    const resolver = makeResolver();
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await resolver.resolve({ type: 'workspace-agent' });
    expect(result).toBeNull();
  });

  it('sends target and namespace in request body', async () => {
    const resolver = makeResolver();
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      hostId: 'h1',
      strategy: 'pinned',
      namespaceId: 'prod',
    }));

    const target: ExecutionTarget = {
      type: 'workspace-agent',
      hostId: 'h1',
      hostSelection: 'pinned',
      namespace: 'prod',
    };
    await resolver.resolve(target);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.namespaceId).toBe('prod');
    expect(body.target.hostId).toBe('h1');
    expect(body.target.hostSelection).toBe('pinned');
  });

  it('defaults namespace to "default"', async () => {
    const resolver = makeResolver();
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      hostId: 'h1',
      strategy: 'any-matching',
      namespaceId: 'default',
    }));

    await resolver.resolve({ type: 'workspace-agent' });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.namespaceId).toBe('default');
  });

  it('strips trailing slash from gatewayUrl', async () => {
    const resolver = makeResolver({ gatewayUrl: 'http://localhost:4000/' });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      hostId: 'h1',
      strategy: 'any-matching',
      namespaceId: 'default',
    }));

    await resolver.resolve({ type: 'workspace-agent' });

    expect(mockFetch.mock.calls[0]![0]).toBe('http://localhost:4000/internal/resolve-host');
  });

  it('throws on empty internalSecret', () => {
    expect(() => makeResolver({ internalSecret: '' })).toThrow('internalSecret is required');
  });

  it('returns null and logs on invalid response body', async () => {
    const warn = vi.fn();
    const resolver = new GatewayHostResolver({
      gatewayUrl: 'http://localhost:4000',
      internalSecret: 'test-secret',
      logger: { warn },
    });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { noHostId: true }));

    const result = await resolver.resolve({ type: 'workspace-agent' });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
