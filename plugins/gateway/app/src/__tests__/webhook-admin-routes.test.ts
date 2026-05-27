/**
 * Integration tests for webhook admin routes.
 *
 * POST /api/v1/webhooks/provision — provision or rotate a webhook secret
 * GET  /api/v1/webhooks           — list declared webhooks (optionally filter by pluginId)
 * DELETE /api/v1/webhooks/:pluginId/:event[/:instanceId] — revoke webhook
 *
 * Uses real Fastify instance with in-memory cache. Auth context injected via preHandler.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ILogger } from '@kb-labs/core-platform';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookSecretStore } from '../webhook/secret-store.js';
import { registerWebhookAdminRoutes } from '../webhook/admin-routes.js';
import type { WebhookManifestEntry } from '../webhook/router.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'test-plugin';
const OTHER_PLUGIN_ID = 'other-plugin';
const EVENT = 'alert';
const NS = 'ns-test';
const PLUGIN_ROOT = '/plugins/test-plugin';
const BASE_URL = 'http://localhost:4000';

function makeManifest(pluginId: string, events: string[]): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: pluginId,
    version: '1.0.0',
    webhooks: {
      handlers: events.map((event) => ({
        event,
        handler: `./dist/webhooks/${event}.js#default`,
        auth: { type: 'secret' as const, header: 'X-Webhook-Secret' },
      })),
    },
  };
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(function () { return noopLogger; }),
} as unknown as ILogger;

function makeAuthContext(namespaceId = NS) {
  return {
    type: 'machine' as const,
    userId: 'admin-001',
    namespaceId,
    tier: 'free' as const,
    permissions: ['webhooks:write', 'webhooks:read'],
  };
}

/** Broker stub that always allows requests (no rate limiting in tests). */
function makeMockBroker(): IResourceBroker {
  const noop = async () => {};
  return {
    registerLimit: vi.fn(),
    tryAcquire: vi.fn().mockResolvedValue({ allowed: true, release: noop }),
  } as unknown as IResourceBroker;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('webhook admin routes', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBackend: { execute: ReturnType<typeof vi.fn> };

  const manifests: WebhookManifestEntry[] = [
    { pluginId: PLUGIN_ID, manifest: makeManifest(PLUGIN_ID, [EVENT, 'push']), pluginRoot: PLUGIN_ROOT },
    { pluginId: OTHER_PLUGIN_ID, manifest: makeManifest(OTHER_PLUGIN_ID, ['deploy']), pluginRoot: '/plugins/other' },
  ];

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBackend = { execute: vi.fn().mockResolvedValue({ ok: true }) };

    app = Fastify({ logger: false });

    // Inject auth context (simulates gatewayRoutes scope).
    // lgtm[js/missing-rate-limiting] - test setup only; production routes have broker-based rate limiting
    app.addHook('preHandler', async (request) => {
      (request as { authContext?: unknown }).authContext = makeAuthContext();
    });

    registerWebhookAdminRoutes(app, {
      cache,
      logger: noopLogger,
      backend: mockBackend as never,
      manifests,
      baseUrl: BASE_URL,
      broker: makeMockBroker(),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend.execute.mockResolvedValue({ ok: true });
  });

  // ── POST /api/v1/webhooks/provision ────────────────────────────────────────

  describe('POST /api/v1/webhooks/provision', () => {
    it('provisions a webhook and returns url + secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID, event: EVENT },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { url: string; secret: string; rotated: boolean };
      expect(body.url).toBe(`${BASE_URL}/webhooks/${PLUGIN_ID}/${EVENT}`);
      expect(typeof body.secret).toBe('string');
      expect(body.secret).toHaveLength(64);
      expect(body.rotated).toBe(false);
    });

    it('re-provision rotates the secret', async () => {
      // First provision
      await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID, event: 'push' },
      });

      // Second provision (rotation)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID, event: 'push' },
      });

      const body = res.json() as { rotated: boolean };
      expect(res.statusCode).toBe(200);
      expect(body.rotated).toBe(true);
    });

    it('400 when pluginId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { event: EVENT },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 when event is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID },
      });
      expect(res.statusCode).toBe(400);
    });

    it('404 when plugin/event not found in manifests', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: 'unknown-plugin', event: 'alert' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('401 when auth context is absent', async () => {
      const appNoAuth = Fastify({ logger: false });
      registerWebhookAdminRoutes(appNoAuth, {
        cache: new InMemoryCache(),
        logger: noopLogger,
        backend: mockBackend as never,
        manifests,
        baseUrl: BASE_URL,
        broker: makeMockBroker(),
      });
      await appNoAuth.ready();

      const res = await appNoAuth.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID, event: EVENT },
      });
      expect(res.statusCode).toBe(401);
      await appNoAuth.close();
    });
  });

  // ── GET /api/v1/webhooks ───────────────────────────────────────────────────

  describe('GET /api/v1/webhooks', () => {
    it('lists all declared webhooks across all manifests', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/webhooks' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { webhooks: Array<{ pluginId: string; event: string; provisioned: boolean }> };
      expect(body.webhooks.length).toBe(3); // alert, push, deploy
      // Each entry has a provisioned flag
      expect(body.webhooks.every((w) => typeof w.provisioned === 'boolean')).toBe(true);
    });

    it('provisioned=true only for webhooks with an active secret', async () => {
      // Use a fresh isolated cache so no prior test state bleeds in
      const isolatedCache = new InMemoryCache();
      const isolatedBackend = { execute: vi.fn().mockResolvedValue({ ok: true }) };
      const isolatedApp = Fastify({ logger: false });

      // lgtm[js/missing-rate-limiting] - test setup only; production routes have broker-based rate limiting
      isolatedApp.addHook('preHandler', async (request) => {
        (request as { authContext?: unknown }).authContext = makeAuthContext();
      });
      registerWebhookAdminRoutes(isolatedApp, {
        cache: isolatedCache,
        logger: noopLogger,
        backend: isolatedBackend as never,
        manifests,
        baseUrl: BASE_URL,
        broker: makeMockBroker(),
      });
      await isolatedApp.ready();

      // Provision exactly one webhook
      await isolatedApp.inject({
        method: 'POST',
        url: '/api/v1/webhooks/provision',
        payload: { pluginId: PLUGIN_ID, event: EVENT },
      });

      const res = await isolatedApp.inject({ method: 'GET', url: '/api/v1/webhooks' });
      const body = res.json() as { webhooks: Array<{ pluginId: string; event: string; provisioned: boolean }> };

      const alertEntry = body.webhooks.find((w) => w.pluginId === PLUGIN_ID && w.event === EVENT);
      const pushEntry = body.webhooks.find((w) => w.pluginId === PLUGIN_ID && w.event === 'push');

      expect(alertEntry?.provisioned).toBe(true);
      expect(pushEntry?.provisioned).toBe(false);

      await isolatedApp.close();
    });

    it('filters by pluginId query param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks?pluginId=${PLUGIN_ID}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { webhooks: Array<{ pluginId: string; event: string }> };
      expect(body.webhooks.every((w) => w.pluginId === PLUGIN_ID)).toBe(true);
      expect(body.webhooks.length).toBe(2); // alert + push
    });

    it('401 when auth context is absent', async () => {
      const appNoAuth = Fastify({ logger: false });
      registerWebhookAdminRoutes(appNoAuth, {
        cache: new InMemoryCache(),
        logger: noopLogger,
        backend: mockBackend as never,
        manifests,
        baseUrl: BASE_URL,
        broker: makeMockBroker(),
      });
      await appNoAuth.ready();

      const res = await appNoAuth.inject({ method: 'GET', url: '/api/v1/webhooks' });
      expect(res.statusCode).toBe(401);
      await appNoAuth.close();
    });
  });

  // ── DELETE /api/v1/webhooks/:pluginId/:event ──────────────────────────────

  describe('DELETE /api/v1/webhooks/:pluginId/:event', () => {
    it('204 on successful revoke', async () => {
      // Provision first
      const store = new WebhookSecretStore(cache);
      await store.set(NS, PLUGIN_ID, EVENT, { current: 'secret-to-delete' });

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${PLUGIN_ID}/${EVENT}`,
      });
      expect(res.statusCode).toBe(204);

      // Verify removed
      const entry = await store.get(NS, PLUGIN_ID, EVENT);
      expect(entry).toBeNull();
    });

    it('204 even when no secret was provisioned (idempotent delete)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${PLUGIN_ID}/push`,
      });
      expect(res.statusCode).toBe(204);
    });

    it('204 for multi-instance delete with instanceId', async () => {
      const store = new WebhookSecretStore(cache);
      const INSTANCE = 'inst-abc';
      await store.set(NS, PLUGIN_ID, EVENT, { current: 'secret-inst' }, INSTANCE);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${PLUGIN_ID}/${EVENT}/${INSTANCE}`,
      });
      expect(res.statusCode).toBe(204);

      const entry = await store.get(NS, PLUGIN_ID, EVENT, INSTANCE);
      expect(entry).toBeNull();
    });

    it('401 when auth context is absent', async () => {
      const appNoAuth = Fastify({ logger: false });
      registerWebhookAdminRoutes(appNoAuth, {
        cache: new InMemoryCache(),
        logger: noopLogger,
        backend: mockBackend as never,
        manifests,
        baseUrl: BASE_URL,
        broker: makeMockBroker(),
      });
      await appNoAuth.ready();

      const res = await appNoAuth.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${PLUGIN_ID}/${EVENT}`,
      });
      expect(res.statusCode).toBe(401);
      await appNoAuth.close();
    });
  });
});
