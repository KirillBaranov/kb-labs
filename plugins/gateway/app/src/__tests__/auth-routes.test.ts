/**
 * Integration tests for auth routes (CC4 — Auth Flow).
 * Spins up a real Fastify instance with mocked AuthService.
 *
 * Covers:
 *   POST /auth/register  — requires MACHINE_REGISTER permission (admin-only)
 *   POST /auth/token     — happy path, bad creds (401), bad body (400)
 *   POST /auth/refresh   — happy path, expired token (401), bad body (400)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import { createAuthMiddleware } from '../auth/middleware.js';
import { registerAuthRoutes } from '../auth/routes.js';

// ── Minimal stub cache ────────────────────────────────────────────────────────

const ADMIN_MACHINE_TOKEN = 'test-admin-machine-token';

function makeCache(): ICache {
  const store = new Map<string, unknown>();
  // Pre-seed an admin machine token with MACHINE_REGISTER permission so tests
  // can authenticate as a privileged machine client via Bearer header.
  store.set(`host:token:${ADMIN_MACHINE_TOKEN}`, {
    hostId: 'test-admin-host',
    namespaceId: 'test-ns',
    permissions: [PERMISSIONS.MACHINE_REGISTER],
  });
  return {
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async clear() { store.clear(); },
  } as unknown as ICache;
}

/** Returns the Authorization header for the pre-seeded admin machine token. */
function adminAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${ADMIN_MACHINE_TOKEN}` };
}

// ── Mocked AuthService ────────────────────────────────────────────────────────

function makeAuthService() {
  return {
    register: vi.fn(),
    issueTokens: vi.fn(),
    refreshTokens: vi.fn(),
    verify: vi.fn(),
  };
}

const testJwtConfig: JwtConfig = { secret: 'test-secret' };

let app: FastifyInstance;
let authService: ReturnType<typeof makeAuthService>;

beforeAll(async () => {
  authService = makeAuthService();
  app = Fastify({ logger: false });

  const cache = makeCache();
  app.addHook('preHandler', createAuthMiddleware(cache, testJwtConfig));

  // We inject the mocked authService via cast — same interface
  registerAuthRoutes(app, authService as never);

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ── POST /auth/register ───────────────────────────────────────────────────────
// This endpoint now requires MACHINE_REGISTER permission (admin-only, ADR-0020).
// Anonymous callers get 401 from the auth middleware; authenticated callers
// without the permission get 403 from the handler.

describe('POST /auth/register', () => {
  it('returns 200 with clientId, clientSecret, hostId, namespaceId on success (admin Bearer)', async () => {
    authService.register.mockResolvedValue({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      hostId: 'host-001',
      namespaceId: 'ns_server_generated',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: adminAuthHeader(),
      payload: { name: 'My Agent' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { clientId: string; clientSecret: string; hostId: string; namespaceId: string };
    expect(body.clientId).toBe('client-abc');
    expect(body.clientSecret).toBe('secret-xyz');
    expect(body.hostId).toBe('host-001');
    expect(body.namespaceId).toBe('ns_server_generated');
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Agent' }),
    );
  });

  it('rejects client-supplied namespaceId (must not be passed to authService)', async () => {
    authService.register.mockResolvedValue({
      clientId: 'c', clientSecret: 's', hostId: 'h', namespaceId: 'ns_generated',
    });

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: adminAuthHeader(),
      payload: { name: 'Agent', namespaceId: 'victim-tenant' },
    });

    // namespaceId supplied by client must NOT reach the service
    expect(authService.register).toHaveBeenCalledWith(
      expect.not.objectContaining({ namespaceId: 'victim-tenant' }),
    );
  });

  it('returns 400 when name is missing (authenticated admin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: adminAuthHeader(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toBe('Bad Request');
  });

  it('returns 400 when body is empty (authenticated admin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: adminAuthHeader(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('forwards capabilities array to authService', async () => {
    authService.register.mockResolvedValue({
      clientId: 'c-2',
      clientSecret: 's-2',
      hostId: 'h-2',
      namespaceId: 'ns_generated',
    });

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: adminAuthHeader(),
      payload: { name: 'Cap Agent', capabilities: ['read', 'write'] },
    });

    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['read', 'write'] }),
    );
  });

  it('returns 401 for anonymous (no Authorization header)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'x' },
      // No Authorization header — middleware blocks with 401
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── POST /auth/token ──────────────────────────────────────────────────────────

describe('POST /auth/token', () => {
  it('returns 200 with token pair on valid credentials', async () => {
    authService.issueTokens.mockResolvedValue({
      accessToken: 'access.jwt.token',
      refreshToken: 'refresh.jwt.token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { clientId: 'client-abc', clientSecret: 'secret-xyz' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; tokenType: string };
    expect(body.accessToken).toBe('access.jwt.token');
    expect(body.tokenType).toBe('Bearer');
    expect(authService.issueTokens).toHaveBeenCalledWith('client-abc', 'secret-xyz');
  });

  it('returns 401 when credentials are invalid (issueTokens returns null)', async () => {
    authService.issueTokens.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { clientId: 'bad', clientSecret: 'wrong' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Invalid credentials');
  });

  it('returns 400 when clientId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { clientSecret: 'xyz' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when clientSecret is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { clientId: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns 200 with new token pair on valid refresh token', async () => {
    authService.refreshTokens.mockResolvedValue({
      accessToken: 'new.access.token',
      refreshToken: 'new.refresh.token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'valid.refresh.token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBe('new.access.token');
    expect(body.refreshToken).toBe('new.refresh.token');
    expect(authService.refreshTokens).toHaveBeenCalledWith('valid.refresh.token');
  });

  it('returns 401 when refresh token is invalid (refreshTokens returns null)', async () => {
    authService.refreshTokens.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'expired.or.invalid' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string; message: string };
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Invalid or expired');
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body contains wrong field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { token: 'wrong-field-name' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Auth middleware: public routes skip auth check ────────────────────────────
// /auth/token and /auth/refresh are public (no Bearer needed to exchange credentials).

describe('Auth middleware — public routes', () => {
  it('/auth/token is accessible without Authorization header', async () => {
    authService.issueTokens.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { clientId: 'x', clientSecret: 'y' },
      // No Authorization header — should not be blocked by middleware
    });

    // 401 from the handler (bad credentials) — not from middleware
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });
});
