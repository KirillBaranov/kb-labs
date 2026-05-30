/**
 * Integration tests for Telemetry Ingestion endpoint.
 *
 * Covers:
 *   POST /telemetry/v1/ingest
 *     - 401 without auth
 *     - 400 with invalid body
 *     - 400 with empty events array
 *     - 503 when analytics not configured
 *     - 200 single event ingest
 *     - 200 batch ingest (multiple events)
 *     - 200 with default timestamp when omitted
 *     - 422 when all events fail
 *     - Partial success (some accepted, some rejected)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ICache, ILogger, IAnalytics } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { createAuthMiddleware } from '../auth/middleware.js';
import { registerTelemetryRoutes } from '../telemetry/routes.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockAnalytics: IAnalytics = {
  track: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn(),
};

let analyticsEnabled = true;

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    get analytics() { return analyticsEnabled ? mockAnalytics : undefined; },
  },
}));

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
const TEST_TOKEN = 'test-telemetry-token';
const TEST_AUTH_HEADER = `Bearer ${TEST_TOKEN}`;

// ── Test app builder ──────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const cache = makeCache();
  await cache.set(`host:token:${TEST_TOKEN}`, {
    hostId: 'host-test',
    namespaceId: 'ns-test',
  });

  const app = Fastify({ logger: false });
  await app.register(async function scope(s) {
    s.addHook('onRequest', createAuthMiddleware(cache, stubJwtConfig));
    registerTelemetryRoutes(s as any, noopLogger);
  });

  await app.ready();
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeIngestPayload(overrides: Record<string, unknown> = {}) {
  return {
    events: [
      {
        source: 'my-product',
        type: 'user.signup',
        payload: { plan: 'pro' },
      },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /telemetry/v1/ingest', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    analyticsEnabled = true;
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      payload: makeIngestPayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────

  it('returns 400 with empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with empty events array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when event missing required source field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: { events: [{ type: 'test' }] }, // missing source
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Analytics unavailable ─────────────────────────────────────────────

  it('returns 503 when analytics adapter not configured', async () => {
    analyticsEnabled = false;
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeIngestPayload(),
    });
    expect(res.statusCode).toBe(503);
  });

  // ── Happy path ────────────────────────────────────────────────────────

  it('ingests single event and calls analytics.track()', async () => {
    (mockAnalytics.track as any).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeIngestPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(0);

    expect(mockAnalytics.track).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'user.signup',
      expect.objectContaining({
        _source: 'my-product',
        _tenantId: 'ns-test',
        plan: 'pro',
      }),
    );
  });

  it('ingests batch of multiple events', async () => {
    (mockAnalytics.track as any).mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: {
        events: [
          { source: 'api', type: 'request', payload: { path: '/a' } },
          { source: 'api', type: 'request', payload: { path: '/b' } },
          { source: 'api', type: 'error', payload: { code: 500 } },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(3);
    expect(body.rejected).toBe(0);
    expect(mockAnalytics.track).toHaveBeenCalledTimes(3);
  });

  it('uses current timestamp when event.timestamp is omitted', async () => {
    (mockAnalytics.track as any).mockResolvedValue(undefined);

    await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeIngestPayload(),
    });

    const trackCall = (mockAnalytics.track as any).mock.calls[0];
    expect(trackCall[1]._ts).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(trackCall[1]._ts).getTime()).toBeGreaterThan(0);
  });

  it('passes tags as flat properties', async () => {
    (mockAnalytics.track as any).mockResolvedValue(undefined);

    await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: {
        events: [
          {
            source: 'my-app',
            type: 'deploy',
            tags: { env: 'prod', region: 'eu' },
            payload: { version: '1.2.3' },
          },
        ],
      },
    });

    expect(mockAnalytics.track).toHaveBeenCalledWith(
      'deploy',
      expect.objectContaining({
        env: 'prod',
        region: 'eu',
        version: '1.2.3',
      }),
    );
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('returns 422 when all events fail', async () => {
    (mockAnalytics.track as any).mockRejectedValue(new Error('DB write failed'));

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeIngestPayload(),
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].message).toContain('DB write failed');
  });

  it('handles partial failure (some events succeed, some fail)', async () => {
    let callCount = 0;
    (mockAnalytics.track as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {throw new Error('Failed event 2');}
    });

    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/v1/ingest',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: {
        events: [
          { source: 'app', type: 'ok1' },
          { source: 'app', type: 'fail' },
          { source: 'app', type: 'ok2' },
        ],
      },
    });

    expect(res.statusCode).toBe(200); // partial success = 200
    const body = res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].index).toBe(1);
  });
});
