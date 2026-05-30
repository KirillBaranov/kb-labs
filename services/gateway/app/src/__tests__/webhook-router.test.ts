/**
 * Unit/integration tests for registerWebhookRoutes.
 *
 * Uses real Fastify instance with mocked globalDispatcher and real
 * in-memory secret store. Tests all request handling behaviours:
 * auth, challenge, idempotency, rate limiting, async dispatch, multi-instance.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import type { ILogger } from '@kb-labs/core-platform';
import type { ManifestV3, WebhookHandlerDecl } from '@kb-labs/plugin-contracts';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookSecretStore } from '../webhook/secret-store.js';

// ── Mock globalDispatcher before importing router ──────────────────────────────

const { mockDispatcher } = vi.hoisted(() => {
  const mockDispatcher = {
    firstHostWithCapability: vi.fn(),
    call: vi.fn(),
  };
  return { mockDispatcher };
});

vi.mock('../hosts/dispatcher.js', () => ({
  globalDispatcher: mockDispatcher,
  HostCallDispatcher: vi.fn(),
}));

import { registerWebhookRoutes, type WebhookManifestEntry } from '../webhook/router.js';

// ── Constants & fixtures ──────────────────────────────────────────────────────

const PLUGIN_ID = 'test-plugin';
const EVENT = 'alert';
const SECRET = 'test-secret-abc';
const NS = 'ns-test';
const PLUGIN_ROOT = '/plugins/test-plugin';
const WEBHOOK_URL = `/webhooks/${PLUGIN_ID}/${EVENT}`;

function makeManifest(handlers: WebhookHandlerDecl[]): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: PLUGIN_ID,
    version: '1.0.0',
    webhooks: { handlers },
  };
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(function () { return noopLogger; }),
} as unknown as ILogger;

function makeMockBroker() {
  return {
    registerLimit: vi.fn(),
    tryAcquire: vi.fn().mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hmacSig(body: Buffer | string, secret: string, prefix = ''): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${prefix}${sig}`;
}

function makeBody(obj: object): string {
  return JSON.stringify(obj);
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function buildApp(
  manifests: WebhookManifestEntry[],
  cache: InMemoryCache,
  broker: ReturnType<typeof makeMockBroker>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerWebhookRoutes(app, {
    cache,
    broker: broker as never,
    logger: noopLogger,
    manifests,
  });
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — startup validation', () => {
  it('throws at startup if a declaration has no auth config', async () => {
    const cache = new InMemoryCache();
    const broker = makeMockBroker();
    const manifest = makeManifest([
      {
        event: 'push',
        handler: './dist/handler.js#default',
        auth: undefined as never, // intentionally missing
      },
    ]);

    const app = Fastify({ logger: false });
    await expect(
      registerWebhookRoutes(app, {
        cache,
        broker: broker as never,
        logger: noopLogger,
        manifests: [{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }],
      }),
    ).rejects.toThrow(`webhook '${PLUGIN_ID}/push' has no auth config`);
    await app.close();
  });

  it('returns registered route count', async () => {
    const cache = new InMemoryCache();
    const broker = makeMockBroker();
    const manifest = makeManifest([
      { event: 'push', handler: './h.js', auth: { type: 'secret', header: 'X-Sec' } },
      { event: 'pull_request', handler: './h.js', auth: { type: 'secret', header: 'X-Sec' } },
    ]);
    const app = Fastify({ logger: false });
    const count = await registerWebhookRoutes(app, {
      cache,
      broker: broker as never,
      logger: noopLogger,
      manifests: [{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }],
    });
    expect(count).toBe(2);
    await app.ready();
    await app.close();
  });
});

// ── Main suite — secret auth ──────────────────────────────────────────────────

describe('registerWebhookRoutes — secret auth', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './dist/webhooks/alert.js#default',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();

    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET });

    app = await buildApp(
      [{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }],
      cache,
      mockBroker,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({ output: 'processed' });
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('missing x-kb-namespace header → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ event: 'alert' }),
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain('x-kb-namespace');
  });

  it('unknown event → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${PLUGIN_ID}/unknown-event`,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({}),
    });
    expect(res.statusCode).toBe(404);
  });

  it('unknown pluginId → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/unknown-plugin/${EVENT}`,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({}),
    });
    expect(res.statusCode).toBe(404);
  });

  it('wrong secret → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': 'wrong-secret', 'Content-Type': 'application/json' },
      payload: makeBody({ event: 'alert' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('correct secret → 200 with result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ event: 'alert', severity: 'critical' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; result: unknown };
    expect(body.status).toBe('ok');
    expect(mockDispatcher.call).toHaveBeenCalledOnce();
  });

  it('dispatches with correct namespace and plugin', async () => {
    await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ foo: 'bar' }),
    });

    expect(mockDispatcher.firstHostWithCapability).toHaveBeenCalledWith(NS, 'execution');
    expect(mockDispatcher.call).toHaveBeenCalledWith(
      NS,
      'host-001',
      'execution',
      'execute',
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: PLUGIN_ID,
          handlerRef: './dist/webhooks/alert.js#default',
        }),
      ]),
    );
  });

  it('no execution host → 503', async () => {
    mockDispatcher.firstHostWithCapability.mockReturnValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({}),
    });
    expect(res.statusCode).toBe(503);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — rate limiting', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
      rateLimit: { requestsPerMinute: 10 },
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Don't clear all mocks here — registerLimit is called during beforeAll setup
    // and we verify it in the first test. Only reset dispatcher state.
    mockDispatcher.firstHostWithCapability.mockReset().mockReturnValue('host-001');
    mockDispatcher.call.mockReset().mockResolvedValue({});
  });

  it('broker.registerLimit called with correct resource on startup', () => {
    expect(mockBroker.registerLimit).toHaveBeenCalledWith(
      `webhook:${PLUGIN_ID}:${EVENT}`,
      { requestsPerMinute: 10 },
    );
  });

  it('rate limit token is released after successful dispatch', async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    mockBroker.tryAcquire.mockResolvedValue({ allowed: true, release: releaseMock });

    await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ event: 'test' }),
    });

    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it('rate limit exceeded → 429', async () => {
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: false,
      waitTimeMs: 5000,
      release: vi.fn().mockResolvedValue(undefined),
    });

    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({}),
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

// ── Challenge (Slack url_verification) ───────────────────────────────────────

describe('registerWebhookRoutes — challenge', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
      challenge: {
        bodyPath: 'type',
        value: 'url_verification',
        replyPath: 'challenge',
      },
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({});
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('challenge request → 200 with challenge field, handler NOT called', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'Content-Type': 'application/json' },
      payload: makeBody({ type: 'url_verification', challenge: 'abc123xyz' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, string>;
    expect(body.challenge).toBe('abc123xyz');
    expect(mockDispatcher.call).not.toHaveBeenCalled();
  });

  it('non-challenge request goes through auth normally', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ type: 'event_callback', event: { type: 'message' } }),
    });
    // Challenge does not match → proceeds to auth → correct secret → 200
    expect(res.statusCode).toBe(200);
    expect(mockDispatcher.call).toHaveBeenCalledOnce();
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — idempotency', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
      idempotencyKey: 'delivery.id',
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({});
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('first delivery processed normally', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ delivery: { id: 'del-001' } }),
    });
    expect(res.statusCode).toBe(200);
    expect(mockDispatcher.call).toHaveBeenCalledOnce();
  });

  it('duplicate delivery → 200 early, handler NOT called again', async () => {
    // First delivery (already done above, but cache persists)
    await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ delivery: { id: 'del-dup' } }),
    });
    vi.clearAllMocks();
    mockBroker.tryAcquire.mockResolvedValue({ allowed: true, release: vi.fn().mockResolvedValue(undefined) });

    // Second delivery — same id
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ delivery: { id: 'del-dup' } }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string };
    expect(body.status).toBe('duplicate');
    expect(mockDispatcher.call).not.toHaveBeenCalled();
  });
});

// ── Async dispatch ────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — async dispatch', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
      async: true,
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({});
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('async webhook → 202 immediately', async () => {
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
      payload: makeBody({ severity: 'high' }),
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { status: string; webhookId: string };
    expect(body.status).toBe('accepted');
    expect(typeof body.webhookId).toBe('string');
  });
});

// ── Multi-instance ────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — multi-instance', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const INSTANCE_A = 'instance-a';
  const INSTANCE_B = 'instance-b';
  const SECRET_A = 'secret-for-a';
  const SECRET_B = 'secret-for-b';

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
      multi: true,
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET_A }, INSTANCE_A);
    await store.set(NS, PLUGIN_ID, EVENT, { current: SECRET_B }, INSTANCE_B);
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({});
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('instance A secret accepted for instance A', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${PLUGIN_ID}/${EVENT}/${INSTANCE_A}`,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET_A, 'Content-Type': 'application/json' },
      payload: makeBody({ msg: 'from A' }),
    });
    expect(res.statusCode).toBe(200);
  });

  it('instance B secret rejected for instance A', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/${PLUGIN_ID}/${EVENT}/${INSTANCE_A}`,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET_B, 'Content-Type': 'application/json' },
      payload: makeBody({ msg: 'from B' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('instanceId is included in the host context passed to dispatcher', async () => {
    await app.inject({
      method: 'POST',
      url: `/webhooks/${PLUGIN_ID}/${EVENT}/${INSTANCE_A}`,
      headers: { 'x-kb-namespace': NS, 'X-Webhook-Secret': SECRET_A, 'Content-Type': 'application/json' },
      payload: makeBody({}),
    });
    const [, , , , args] = mockDispatcher.call.mock.calls[0] as [string, string, string, string, [{ descriptor: { hostContext: { instanceId?: string } } }]];
    expect(args[0]?.descriptor.hostContext.instanceId).toBe(INSTANCE_A);
  });
});

// ── HMAC auth ─────────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — HMAC auth', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const HMAC_SECRET = 'hmac-signing-secret';

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './h.js',
      auth: { type: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' },
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: HMAC_SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockDispatcher.call.mockResolvedValue({});
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('valid HMAC → 200', async () => {
    const body = makeBody({ ref: 'refs/heads/main' });
    const sig = hmacSig(body, HMAC_SECRET, 'sha256=');
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'x-hub-signature-256': sig, 'Content-Type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
  });

  it('tampered body → 401', async () => {
    const originalBody = makeBody({ ref: 'refs/heads/main' });
    const sig = hmacSig(originalBody, HMAC_SECRET, 'sha256=');
    const tamperedBody = makeBody({ ref: 'refs/heads/tampered' });
    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'x-hub-signature-256': sig, 'Content-Type': 'application/json' },
      payload: tamperedBody,
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Custom auth ───────────────────────────────────────────────────────────────

describe('registerWebhookRoutes — custom auth', () => {
  let app: FastifyInstance;
  let cache: InMemoryCache;
  let mockBroker: ReturnType<typeof makeMockBroker>;

  const CUSTOM_SECRET = 'custom-signing-secret';

  const manifest = makeManifest([
    {
      event: EVENT,
      handler: './dist/webhooks/alert.js#default',
      auth: {
        type: 'custom',
        validator: './dist/webhooks/stripe-validate.js#default',
      },
    },
  ]);

  beforeAll(async () => {
    cache = new InMemoryCache();
    mockBroker = makeMockBroker();
    const store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN_ID, EVENT, { current: CUSTOM_SECRET });
    app = await buildApp([{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }], cache, mockBroker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatcher.firstHostWithCapability.mockReturnValue('host-001');
    mockBroker.tryAcquire.mockResolvedValue({
      allowed: true,
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('validator returns { valid: true } → 200 and handler executed', async () => {
    // First dispatcher.call: custom auth validator → { valid: true }
    // Second dispatcher.call: actual handler → result
    mockDispatcher.call
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ output: 'processed' });

    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'Content-Type': 'application/json' },
      payload: makeBody({ type: 'payment_intent.succeeded', amount: 1000 }),
    });

    expect(res.statusCode).toBe(200);
    // Validator call + handler call
    expect(mockDispatcher.call).toHaveBeenCalledTimes(2);
    // First call must reference the validator handlerRef
    const [, , , , validatorArgs] = mockDispatcher.call.mock.calls[0] as [unknown, unknown, unknown, unknown, [{ handlerRef: string }]];
    expect(validatorArgs[0]?.handlerRef).toBe('./dist/webhooks/stripe-validate.js#default');
  });

  it('validator returns { valid: false } → 401, handler NOT called', async () => {
    mockDispatcher.call.mockResolvedValueOnce({ valid: false });

    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'Content-Type': 'application/json' },
      payload: makeBody({ type: 'checkout.session.expired' }),
    });

    expect(res.statusCode).toBe(401);
    // Only the validator call, not the handler
    expect(mockDispatcher.call).toHaveBeenCalledTimes(1);
  });

  it('validator throws → 401, handler NOT called', async () => {
    mockDispatcher.call.mockRejectedValueOnce(new Error('validator timeout'));

    const res = await app.inject({
      method: 'POST',
      url: WEBHOOK_URL,
      headers: { 'x-kb-namespace': NS, 'Content-Type': 'application/json' },
      payload: makeBody({ type: 'test' }),
    });

    expect(res.statusCode).toBe(401);
    expect(mockDispatcher.call).toHaveBeenCalledTimes(1);
  });
});
