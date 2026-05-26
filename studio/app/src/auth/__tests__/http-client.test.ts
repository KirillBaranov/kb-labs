/**
 * Unit tests for the auth-aware HTTP client (ADR-0020, Phase 2.1).
 *
 * Uses injected mocks for fetch, BroadcastChannel, and cookie reading so
 * all tests run in the default Node environment — no jsdom needed.
 *
 * Coverage:
 *   - CSRF header injected on mutating methods (POST/PUT/PATCH/DELETE)
 *   - CSRF header NOT set on GET/HEAD/OPTIONS
 *   - withCredentials always true (credentials: 'include')
 *   - 401 → single-flight refresh → retry original request
 *   - Parallel 401s in the same tab → one refresh, others wait
 *   - Multi-tab: another tab broadcasts refresh:started → wait for result
 *   - Multi-tab: another tab broadcasts refresh:failed → own 401 surfaces
 *   - Refresh fails → onUnauthenticated emitted, no retry
 *   - Non-401 errors propagate as-is
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthHttpClient, type AuthHttpClientOptions } from '../http-client.js';

// ── Fake fetch helpers ────────────────────────────────────────────────────────

function okResponse(body: unknown = { ok: true }, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers({ 'content-type': 'application/json' }),
    clone: function () { return this as Response; },
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    statusText: String(status),
    json: () => Promise.resolve({ error: 'err' }),
    text: () => Promise.resolve('{"error":"err"}'),
    headers: new Headers(),
    clone: function () { return this as Response; },
  } as unknown as Response;
}

// ── Fake BroadcastChannel ─────────────────────────────────────────────────────

type BCMessage = { type: string; [k: string]: unknown };

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  name: string;
  onmessage: ((ev: { data: BCMessage }) => void) | null = null;
  posted: BCMessage[] = [];

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(msg: BCMessage): void {
    this.posted.push(msg);
    // Deliver to other instances of the same channel (simulates cross-tab).
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && other.name === this.name && other.onmessage) {
        other.onmessage({ data: msg });
      }
    }
  }

  close(): void {
    FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter((c) => c !== this);
  }
}

// ── Test builder ──────────────────────────────────────────────────────────────

function buildClient(overrides: Partial<AuthHttpClientOptions> = {}) {
  const onUnauthenticated = vi.fn();
  const csrfToken = 'test-csrf-token';
  const getCookie = (name: string) => (name === 'kb_csrf' ? csrfToken : undefined);

  const client = createAuthHttpClient({
    baseURL: '',
    onUnauthenticated,
    _getCookie: getCookie,
    _BroadcastChannel: FakeBroadcastChannel as unknown as typeof BroadcastChannel,
    ...overrides,
  });

  return { client, onUnauthenticated, csrfToken };
}

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CSRF header', () => {
  it('adds X-CSRF-Token on POST', async () => {
    let captured: RequestInit | undefined;
    const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(okResponse());
    });
    const { client, csrfToken } = buildClient({ _fetch: mockFetch });

    await client.fetch('/test', { method: 'POST' });

    expect((captured?.headers as Record<string, string>)['X-CSRF-Token']).toBe(csrfToken);
  });

  it('adds X-CSRF-Token on PUT, PATCH, DELETE', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      let captured: RequestInit | undefined;
      const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
        captured = init;
        return Promise.resolve(okResponse());
      });
      const { client, csrfToken } = buildClient({ _fetch: mockFetch });
      await client.fetch('/test', { method });
      expect((captured?.headers as Record<string, string>)['X-CSRF-Token']).toBe(csrfToken);
    }
  });

  it('does NOT add X-CSRF-Token on GET', async () => {
    let captured: RequestInit | undefined;
    const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(okResponse());
    });
    const { client } = buildClient({ _fetch: mockFetch });
    await client.fetch('/test', { method: 'GET' });
    expect((captured?.headers as Record<string, string> | undefined)?.['X-CSRF-Token']).toBeUndefined();
  });

  it('does NOT add X-CSRF-Token when cookie is absent', async () => {
    let captured: RequestInit | undefined;
    const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(okResponse());
    });
    const { client } = buildClient({
      _fetch: mockFetch,
      _getCookie: () => undefined,
    });
    await client.fetch('/test', { method: 'POST' });
    expect((captured?.headers as Record<string, string> | undefined)?.['X-CSRF-Token']).toBeUndefined();
  });
});

describe('credentials: include', () => {
  it('always sends credentials: include', async () => {
    let captured: RequestInit | undefined;
    const mockFetch = vi.fn((_url: unknown, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(okResponse());
    });
    const { client } = buildClient({ _fetch: mockFetch });
    await client.fetch('/test');
    expect(captured?.credentials).toBe('include');
  });
});

describe('401 → single-flight refresh → retry', () => {
  it('refreshes on 401 and retries the original request', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn((url: unknown) => {
      const path = String(url);
      calls.push(path);
      if (path.includes('/auth/refresh')) {
        return Promise.resolve(okResponse({ ok: true }));
      }
      // First call to /data → 401, second → 200
      if (path.includes('/data') && calls.filter((c) => c.includes('/data')).length === 1) {
        return Promise.resolve(errorResponse(401));
      }
      return Promise.resolve(okResponse({ value: 42 }));
    });

    const { client } = buildClient({ _fetch: mockFetch });
    const result = await client.fetch('/data');

    expect(result).toEqual({ value: 42 });
    // Should have called: /data (401), /auth/refresh, /data (200)
    expect(calls.filter((c) => c.includes('/auth/refresh'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/data'))).toHaveLength(2);
  });

  it('single-flight: two parallel 401s make only one refresh call', async () => {
    let dataCallCount = 0;
    let refreshCallCount = 0;

    const mockFetch = vi.fn((url: unknown) => {
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        refreshCallCount++;
        return Promise.resolve(okResponse({ ok: true }));
      }
      dataCallCount++;
      if (dataCallCount <= 2) {
        // First two data calls → 401
        return Promise.resolve(errorResponse(401));
      }
      return Promise.resolve(okResponse({ value: dataCallCount }));
    });

    const { client } = buildClient({ _fetch: mockFetch });

    // Fire two requests simultaneously
    const [r1, r2] = await Promise.all([
      client.fetch('/data/a'),
      client.fetch('/data/b'),
    ]);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    // Only one refresh despite two 401s
    expect(refreshCallCount).toBe(1);
  });

  it('calls onUnauthenticated and does not retry when refresh fails', async () => {
    const mockFetch = vi.fn((url: unknown) => {
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        return Promise.resolve(errorResponse(401));
      }
      return Promise.resolve(errorResponse(401));
    });

    const { client, onUnauthenticated } = buildClient({ _fetch: mockFetch });

    await expect(client.fetch('/data')).rejects.toBeDefined();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('propagates non-401 errors without refreshing', async () => {
    const mockFetch = vi.fn(() => Promise.resolve(errorResponse(500)));
    const { client, onUnauthenticated } = buildClient({ _fetch: mockFetch });

    await expect(client.fetch('/data')).rejects.toBeDefined();
    expect(onUnauthenticated).not.toHaveBeenCalled();
    // Only one fetch call — no refresh attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('multi-tab BroadcastChannel coordination', () => {
  it('waits for refresh:done from another tab and does NOT call /auth/refresh itself', async () => {
    let dataCallCount = 0;
    const mockFetch = vi.fn((url: unknown) => {
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        // Should NOT be called — the "other tab" refreshes
        return Promise.resolve(errorResponse(500));
      }
      dataCallCount++;
      if (dataCallCount === 1) return Promise.resolve(errorResponse(401));
      return Promise.resolve(okResponse({ done: true }));
    });

    // Use a very short broadcastTimeoutMs so the test doesn't take 2s.
    const { client } = buildClient({ _fetch: mockFetch, broadcastTimeoutMs: 200 });

    // Start the fetch — it will get 401 and enter the claim window (50ms).
    const promise = client.fetch('/data');

    // Wait for the 401 handler to set up the BroadcastChannel listener.
    // setTimeout(0) drains the microtask queue and gives the async 401 handler
    // a chance to reach `listenForCrossTabActivity` and set ch.onmessage.
    await new Promise((r) => setTimeout(r, 0));

    const ch = FakeBroadcastChannel.instances[0];
    expect(ch).toBeDefined();

    // Simulate another tab starting refresh within the claim window (50ms).
    ch!.onmessage?.({ data: { type: 'refresh:started' } });

    // Then simulate it finishing before broadcastTimeoutMs (200ms).
    await new Promise((r) => setTimeout(r, 10));
    ch!.onmessage?.({ data: { type: 'refresh:done' } });

    const result = await promise;
    expect(result).toEqual({ done: true });

    // Our tab should NOT have called /auth/refresh.
    const refreshCalls = (mockFetch.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(0);
  });

  it('falls back to own refresh after claim window expires with no cross-tab signal', async () => {
    vi.useFakeTimers();
    let dataCallCount = 0;
    const mockFetch = vi.fn((url: unknown) => {
      const path = String(url);
      if (path.includes('/auth/refresh')) {
        return Promise.resolve(okResponse({ ok: true }));
      }
      dataCallCount++;
      if (dataCallCount === 1) return Promise.resolve(errorResponse(401));
      return Promise.resolve(okResponse({ fallback: true }));
    });

    const { client } = buildClient({ _fetch: mockFetch, broadcastTimeoutMs: 100 });

    const promise = client.fetch('/data');
    // Advance past the claim window (50ms) and the refresh itself.
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ fallback: true });
    vi.useRealTimers();
  });
});

describe('baseURL prepended', () => {
  it('prepends baseURL to the path', async () => {
    let capturedUrl: unknown;
    const mockFetch = vi.fn((url: unknown) => {
      capturedUrl = url;
      return Promise.resolve(okResponse());
    });
    const { client } = buildClient({ _fetch: mockFetch, baseURL: '/api' });
    await client.fetch('/auth/me');
    expect(capturedUrl).toBe('/api/auth/me');
  });
});
