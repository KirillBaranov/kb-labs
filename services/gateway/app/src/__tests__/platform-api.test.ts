/**
 * Integration tests for Unified Platform API.
 *
 * Covers:
 *   POST /platform/v1/{adapter}/{method}
 *     - 401 without auth
 *     - 404 unknown adapter
 *     - 403 method not in allowlist
 *     - 503 adapter not configured
 *     - 501 method not implemented on adapter
 *     - 200 cache/get returns value
 *     - 200 cache/set stores value
 *     - 200 llm/complete proxies to LLM
 *     - 200 analytics/track proxies to analytics
 *     - 502 adapter method throws
 *     - durationMs included in response
 *     - streaming for llm/stream → SSE
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ICache, ILogger, ILLM, IAnalytics } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { createAuthMiddleware } from '../auth/middleware.js';
import { registerPlatformRoutes } from '../platform/routes.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockLLM: ILLM & { chatWithTools: any } = {
  complete: vi.fn(),
  stream: vi.fn(),
  chatWithTools: vi.fn(),
};

const mockAnalytics: Partial<IAnalytics> = {
  track: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn(),
};

const mockCacheStore = new Map<string, unknown>();
const mockCacheAdapter = {
  get: vi.fn(async (k: string) => mockCacheStore.get(k) ?? null),
  set: vi.fn(async (k: string, v: unknown) => { mockCacheStore.set(k, v); }),
  delete: vi.fn(async (k: string) => { mockCacheStore.delete(k); }),
  clear: vi.fn(async () => { mockCacheStore.clear(); }),
};

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    get llm() { return mockLLM; },
    get analytics() { return mockAnalytics; },
    get cache() { return mockCacheAdapter; },
    get vectorStore() { return undefined; },
    get embeddings() { return undefined; },
    get storage() { return undefined; },
    get eventBus() { return undefined; },
    get sqlDatabase() { return undefined; },
    get documentDatabase() { return undefined; },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function makeAuthCache(): ICache {
  const store = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async clear() { store.clear(); },
  } as unknown as ICache;
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => noopLogger),
} as unknown as ILogger;

const stubJwtConfig: JwtConfig = { secret: 'test-secret' };
const TEST_TOKEN = 'test-platform-token';
const TEST_AUTH = `Bearer ${TEST_TOKEN}`;

// ── Test app builder ──────────────────────────────────────────────────────

async function buildApp(): Promise<{ app: FastifyInstance; cache: ICache }> {
  const cache = makeAuthCache();
  await cache.set(`host:token:${TEST_TOKEN}`, {
    hostId: 'host-test',
    namespaceId: 'ns-test',
  });

  const app = Fastify({ logger: false });
  await app.register(async function scope(s) {
    s.addHook('onRequest', createAuthMiddleware(cache, stubJwtConfig));
    registerPlatformRoutes(s as any, noopLogger);
  });
  await app.ready();
  return { app, cache };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Unified Platform API – POST /platform/v1/:adapter/:method', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCacheStore.clear();
    ({ app } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/get',
      payload: { args: ['key'] },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────

  it('returns 404 for unknown adapter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/unknownAdapter/get',
      headers: { authorization: TEST_AUTH },
      payload: { args: [] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ADAPTER_NOT_FOUND');
  });

  it('returns 403 for disallowed method', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/setSource',
      headers: { authorization: TEST_AUTH },
      payload: { args: [] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('returns 503 when adapter not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/vectorStore/search',
      headers: { authorization: TEST_AUTH },
      payload: { args: [{ query: 'test' }] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ADAPTER_UNAVAILABLE');
  });

  // ── Cache adapter ─────────────────────────────────────────────────────

  it('cache/get returns cached value', async () => {
    mockCacheAdapter.get.mockResolvedValueOnce('hello-world');

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/get',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['my-key'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBe('hello-world');
    expect(typeof body.durationMs).toBe('number');
    expect(mockCacheAdapter.get).toHaveBeenCalledWith('my-key');
  });

  it('cache/set stores value', async () => {
    mockCacheAdapter.set.mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/set',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['my-key', { data: 42 }, 60000] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockCacheAdapter.set).toHaveBeenCalledWith('my-key', { data: 42 }, 60000);
  });

  // ── LLM adapter ──────────────────────────────────────────────────────

  it('llm/complete proxies to LLM', async () => {
    mockLLM.complete = vi.fn().mockResolvedValueOnce({
      content: 'Hello!',
      usage: { promptTokens: 10, completionTokens: 5 },
      model: 'test-model',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/llm/complete',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['Say hello', { temperature: 0.5 }] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.result.content).toBe('Hello!');
    expect(mockLLM.complete).toHaveBeenCalledWith('Say hello', { temperature: 0.5 });
  });

  // ── Analytics adapter ─────────────────────────────────────────────────

  it('analytics/track proxies to analytics', async () => {
    (mockAnalytics.track as any).mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/analytics/track',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['user.signup', { plan: 'pro' }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockAnalytics.track).toHaveBeenCalledWith('user.signup', { plan: 'pro' });
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('returns 502 when adapter method throws', async () => {
    mockLLM.complete = vi.fn().mockRejectedValueOnce(new Error('Provider timeout'));

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/llm/complete',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['test'] },
    });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe('Provider timeout');
    expect(body.error.code).toBe('ADAPTER_ERROR');
    expect(typeof body.durationMs).toBe('number');
  });

  // ── durationMs ────────────────────────────────────────────────────────

  it('includes durationMs in response', async () => {
    mockCacheAdapter.get.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/get',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['nonexistent'] },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().durationMs).toBe('number');
    expect(res.json().durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── Args passing ──────────────────────────────────────────────────────

  it('passes args correctly to adapter method', async () => {
    mockCacheAdapter.set.mockResolvedValueOnce(undefined);

    await app.inject({
      method: 'POST',
      url: '/platform/v1/cache/set',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['k', 'v', 30000] },
    });

    expect(mockCacheAdapter.set).toHaveBeenCalledWith('k', 'v', 30000);
  });

  // ── Streaming ─────────────────────────────────────────────────────────

  it('llm/stream returns SSE format', async () => {
    async function* fakeStream() {
      yield 'Hello';
      yield ' world';
    }
    mockLLM.stream = vi.fn().mockReturnValueOnce(fakeStream());

    const res = await app.inject({
      method: 'POST',
      url: '/platform/v1/llm/stream',
      headers: { authorization: TEST_AUTH },
      payload: { args: ['test prompt'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    const lines = res.body.split('\n').filter((l: string) => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThanOrEqual(3); // Hello, world, [DONE]
    expect(lines[0]).toBe('data: Hello');
    expect(lines[1]).toBe('data:  world');
    expect(lines[lines.length - 1]).toBe('data: [DONE]');
  });
});
