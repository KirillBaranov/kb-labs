import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import { HostRegistrationSchema } from '@kb-labs/gateway-contracts';
import { createAuthMiddleware } from '../auth/middleware.js';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { HostRegistry } from '../hosts/registry.js';
import { createWsHandler } from '../hosts/ws-handler.js';
import type { HostCallDispatcher } from '@kb-labs/gateway-core';

// ── Minimal mocks ────────────────────────────────────────────────────────────

function makeCache(): { cache: ICache; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  const cache: ICache = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    clear: vi.fn(async () => { store.clear(); }),
  } as unknown as ICache;
  return { cache, store };
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => noopLogger),
} as unknown as ILogger;

// Build a minimal Fastify app matching server.ts structure (without proxy)
const stubJwtConfig: JwtConfig = { secret: 'test-secret' };

async function buildApp(cache: ICache): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyWebsocket);
  await app.register(fastifyCors, { origin: true });
  app.addHook('preHandler', createAuthMiddleware(cache, stubJwtConfig));

  app.get('/health', async () => ({ status: 'ok', version: '1.0' }));

  const registry = new HostRegistry(cache);

  app.post('/hosts/register', async (request, reply) => {
    const parsed = HostRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
    }
    const result = await registry.register(parsed.data);
    return reply.code(201).send({
      hostId: result.descriptor.hostId,
      machineToken: result.machineToken,
      status: result.descriptor.status,
    });
  });

  app.get('/hosts', async (request, reply) => {
    const auth = request.authContext;
    if (!auth) {return reply.code(401).send({ error: 'Unauthorized' });}
    return { hosts: [] };
  });

  app.get('/hosts/connect', { websocket: true }, createWsHandler(cache, stubJwtConfig, noopLogger));

  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health (public)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { cache } = makeCache();
    app = await buildApp(cache);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '1.0' });
  });
});

describe('POST /hosts/register (public)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { cache } = makeCache();
    app = await buildApp(cache);
  });

  afterEach(async () => { await app.close(); });

  it('registers a host and returns 201 with hostId + machineToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'laptop',
        namespaceId: 'ns-1',
        capabilities: ['filesystem', 'git'],
        workspacePaths: ['/home/user/projects'],
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.hostId).toBeTypeOf('string');
    expect(body.machineToken).toBeTypeOf('string');
    expect(body.status).toBe('offline');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'laptop' }), // missing namespaceId, capabilities, workspacePaths
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 for invalid capability enum value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'h',
        namespaceId: 'ns',
        capabilities: ['invalid-capability'],
        workspacePaths: [],
      }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('does not require auth', async () => {
    // No Authorization header
    const res = await app.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [] }),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Auth middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { cache } = makeCache();
    app = await buildApp(cache);
  });

  afterEach(async () => { await app.close(); });

  it('returns 401 for protected routes without Authorization', async () => {
    const res = await app.inject({ method: 'GET', url: '/hosts' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
  });

  it('returns 401 for unknown Bearer token (no CLI fallback)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/hosts',
      headers: { authorization: 'Bearer some-random-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes protected routes with valid machine token', async () => {
    const { cache } = makeCache();
    const localApp = await buildApp(cache);

    const regRes = await localApp.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [] }),
    });
    const { machineToken } = regRes.json();

    const res = await localApp.inject({
      method: 'GET',
      url: '/hosts',
      headers: { authorization: `Bearer ${machineToken}` },
    });
    expect(res.statusCode).toBe(200);
    await localApp.close();
  });

  it('/health is public — no 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).not.toBe(401);
  });

  it('/hosts/register is public — no 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [] }),
    });
    expect(res.statusCode).not.toBe(401);
  });

  it('machine token resolves correctly', async () => {
    const { cache } = makeCache();
    const localApp = await buildApp(cache);

    // Register host to get machine token
    const regRes = await localApp.inject({
      method: 'POST',
      url: '/hosts/register',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'h', namespaceId: 'ns', capabilities: [], workspacePaths: [] }),
    });
    const { machineToken } = regRes.json();

    // Use machine token on protected route
    const res = await localApp.inject({
      method: 'GET',
      url: '/hosts',
      headers: { authorization: `Bearer ${machineToken}` },
    });
    expect(res.statusCode).toBe(200);
    await localApp.close();
  });
});

// ── POST /internal/dispatch ───────────────────────────────────────────────────

/** Build a minimal app that includes the /internal/dispatch route with an injected dispatcher */
async function buildDispatchApp(
  dispatcher: Pick<HostCallDispatcher, 'firstHost' | 'call'>,
  internalSecret: string | undefined,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);
  await app.register(fastifyCors, { origin: true });

  app.post('/internal/dispatch', async (request, reply) => {
    const provided = request.headers['x-internal-secret'];
    if (!internalSecret || provided !== internalSecret) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      namespaceId?: string;
      hostId?: string;
      adapter?: string;
      method?: string;
      args?: unknown[];
    };

    if (!body.namespaceId || !body.adapter || !body.method) {
      return reply.code(400).send({ error: 'Missing required fields: namespaceId, adapter, method' });
    }

    const hostId = body.hostId ?? dispatcher.firstHost(body.namespaceId);
    if (!hostId) {
      return reply.code(503).send({ error: 'No host connected', namespaceId: body.namespaceId });
    }

    try {
      const result = await dispatcher.call(body.namespaceId, hostId, body.adapter, body.method, body.args ?? []);
      return { result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: message });
    }
  });

  await app.ready();
  return app;
}

const SECRET = 'test-internal-secret';

describe('POST /internal/dispatch', () => {
  let app: FastifyInstance;
  let mockDispatcher: { firstHost: ReturnType<typeof vi.fn>; call: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDispatcher = {
      firstHost: vi.fn(),
      call: vi.fn(),
    };
    app = await buildDispatchApp(mockDispatcher as unknown as HostCallDispatcher, SECRET);
  });

  afterEach(async () => { await app.close(); });

  it('returns 403 with wrong secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': 'wrong' },
      body: JSON.stringify({ namespaceId: 'ns', adapter: 'filesystem', method: 'readFile', args: [] }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Forbidden');
  });

  it('returns 403 with no secret header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ namespaceId: 'ns', adapter: 'filesystem', method: 'readFile', args: [] }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when namespaceId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ adapter: 'filesystem', method: 'readFile' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Missing required fields/);
  });

  it('returns 400 when adapter is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ namespaceId: 'ns', method: 'readFile' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when no host is connected in namespace', async () => {
    mockDispatcher.firstHost.mockReturnValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ namespaceId: 'ns-empty', adapter: 'filesystem', method: 'readFile', args: [] }),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('No host connected');
  });

  it('routes call to provided hostId and returns result', async () => {
    mockDispatcher.call.mockResolvedValue(['file-a.ts', 'file-b.ts']);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({
        namespaceId: 'ns-1',
        hostId: 'host-a',
        adapter: 'filesystem',
        method: 'listDir',
        args: ['/workspace'],
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: ['file-a.ts', 'file-b.ts'] });
    expect(mockDispatcher.call).toHaveBeenCalledWith('ns-1', 'host-a', 'filesystem', 'listDir', ['/workspace']);
  });

  it('falls back to firstHost when no hostId provided', async () => {
    mockDispatcher.firstHost.mockReturnValue('host-auto');
    mockDispatcher.call.mockResolvedValue({ ok: true });

    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ namespaceId: 'ns-1', adapter: 'filesystem', method: 'exists', args: ['/f'] }),
    });

    expect(res.statusCode).toBe(200);
    expect(mockDispatcher.call).toHaveBeenCalledWith('ns-1', 'host-auto', 'filesystem', 'exists', ['/f']);
  });

  it('returns 502 when dispatcher.call throws', async () => {
    mockDispatcher.firstHost.mockReturnValue('host-a');
    mockDispatcher.call.mockRejectedValue(new Error('Connection lost'));

    const res = await app.inject({
      method: 'POST',
      url: '/internal/dispatch',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ namespaceId: 'ns-1', adapter: 'filesystem', method: 'readFile', args: [] }),
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('Connection lost');
  });
});
