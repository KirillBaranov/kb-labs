/**
 * Integration tests for Gateway /health endpoint.
 *
 * Covers:
 *   GET /health
 *     - healthy when all adapters available
 *     - degraded when non-critical adapter missing
 *     - unhealthy when LLM unavailable
 *     - includes uptime and timestamp
 *     - adapter latency reported
 *     - upstream health probing
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import type { GatewayConfig } from '@kb-labs/gateway-contracts';

// ── Mocks ─────────────────────────────────────────────────────────────────

let mockAdapters: Record<string, unknown> = {};

vi.mock('@kb-labs/core-runtime', () => ({
  platform: new Proxy(
    {},
    {
      get(_target, prop) {
        return mockAdapters[prop as string];
      },
    },
  ),
}));

// Mock fetch for upstream probing
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCache(): ICache {
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

// ── App builder ───────────────────────────────────────────────────────────

async function buildHealthApp(
  config: Partial<GatewayConfig> = {},
) {
  // Dynamically import createServer — it uses the mocked platform
  const { createServer } = await import('../server.js');

  const fullConfig: GatewayConfig = {
    port: 0,
    upstreams: {},
    staticTokens: {},
    ...config,
  };

  const cache = makeCache();
  return createServer(fullConfig, cache, noopLogger, stubJwtConfig);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Gateway /health endpoint', () => {
  let app: Awaited<ReturnType<typeof buildHealthApp>>;

  afterEach(async () => {
    if (app) {await app.close();}
    vi.clearAllMocks();
  });

  it('returns healthy when all adapters available', async () => {
    mockAdapters = {
      llm: { complete: vi.fn() },
      cache: { get: vi.fn() },
      analytics: { track: vi.fn() },
      vectorStore: { search: vi.fn() },
      embeddings: { embed: vi.fn() },
    };
    app = await buildHealthApp();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('1.0');
    expect(body.adapters.llm.available).toBe(true);
    expect(body.adapters.cache.available).toBe(true);
    expect(body.adapters.analytics.available).toBe(true);
    expect(body.adapters.vectorStore.available).toBe(true);
    expect(body.adapters.embeddings.available).toBe(true);
  });

  it('returns degraded when non-critical adapter missing', async () => {
    mockAdapters = {
      llm: { complete: vi.fn() },
      cache: { get: vi.fn() },
      analytics: undefined,       // missing
      vectorStore: undefined,     // missing
      embeddings: undefined,      // missing
    };
    app = await buildHealthApp();

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.adapters.llm.available).toBe(true);
    expect(body.adapters.analytics.available).toBe(false);
  });

  it('returns unhealthy when LLM unavailable', async () => {
    mockAdapters = {
      llm: undefined,             // critical missing
      cache: { get: vi.fn() },
      analytics: { track: vi.fn() },
      vectorStore: undefined,
      embeddings: undefined,
    };
    app = await buildHealthApp();

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.status).toBe('unhealthy');
  });

  it('includes uptime and timestamp', async () => {
    mockAdapters = { llm: { complete: vi.fn() } };
    app = await buildHealthApp();

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('reports adapter latency', async () => {
    mockAdapters = {
      llm: { complete: vi.fn() },
      cache: { get: vi.fn() },
    };
    app = await buildHealthApp();

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(typeof body.adapters.llm.latencyMs).toBe('number');
    expect(body.adapters.llm.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('probes upstream health', async () => {
    mockAdapters = { llm: { complete: vi.fn() } };
    mockFetch.mockResolvedValueOnce({ ok: true });

    app = await buildHealthApp({
      upstreams: {
        'rest-api': {
          url: 'http://localhost:5050',
          prefix: '/api/v1',
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.upstreams['rest-api']).toBeDefined();
    expect(body.upstreams['rest-api'].status).toBe('up');
    expect(typeof body.upstreams['rest-api'].latencyMs).toBe('number');
  });

  it('logs structured diagnostics when upstream health probe fails', async () => {
    mockAdapters = { llm: { complete: vi.fn() } };
    mockFetch.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));

    app = await buildHealthApp({
      upstreams: {
        workflow: {
          url: 'http://localhost:7778',
          prefix: '/api/v1/workflow',
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(noopLogger.warn).toHaveBeenCalledWith(
      'Gateway upstream health probe failed',
      expect.objectContaining({
        diagnosticEvent: 'gateway.upstream.health',
        reasonCode: 'upstream_unavailable',
        serviceId: 'gateway',
        route: '/api/v1/workflow/health',
        evidence: expect.objectContaining({
          upstreamId: 'workflow',
          upstreamUrl: 'http://localhost:7778',
        }),
      }),
    );
  });
});
