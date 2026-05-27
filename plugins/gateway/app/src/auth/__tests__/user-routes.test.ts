/**
 * Integration tests for user-auth HTTP routes (ADR-0020, Phase 1.16).
 *
 * Spins up a real Fastify instance with in-memory stores, both middleware
 * layers, and all user-auth routes. Uses fastify.inject() — no network.
 *
 * Coverage:
 *   POST  /auth/login                  — happy, bad creds (CD-8 shape)
 *   POST  /auth/logout                 — happy, CSRF guard
 *   POST  /auth/refresh (user cookie)  — happy, missing cookie, tampered
 *   GET   /auth/me                     — user context + no role field
 *   GET   /auth/providers              — public
 *   GET   /auth/permissions            — cookie auth
 *   POST  /auth/activate               — happy, invalid token
 *   POST  /auth/password/change        — happy, wrong current, CSRF guard
 *   GET   /auth/sessions               — list
 *   POST  /auth/sessions/:fam/revoke   — revoke
 *   POST  /auth/sessions/revoke-all    — revoke all except current
 *   POST  /auth/invites                — admin only, 403 for member
 *   GET   /auth/invites                — admin only
 *   GET   /auth/users                  — admin only
 *   POST  /auth/users/:id/disable      — admin only, CD-1 immediate effect
 *   POST  /auth/users/:id/enable       — admin only
 *   POST  /auth/invites/:id/revoke     — admin only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import type { ICache } from '@kb-labs/core-platform';
import {
  UsersStore,
  CredentialsStore,
  MembershipsStore,
  SessionsStore,
  InvitesStore,
  ProviderRegistry,
  type SessionsStoreOptions,
  createTenantResolver,
  createUserAuthService,
  createEmailPasswordProvider,
  createPasswordPolicy,
  createStubPDP,
  AuthService,
  type JwtConfig,
} from '@kb-labs/gateway-auth';
import { createUserAuthMiddleware } from '../user-auth-middleware.js';
import { createAuthMiddleware } from '../middleware.js';
import { registerAuthRoutes, type MachineAuthRoutesUserExt } from '../routes.js';
import { registerUserAuthRoutes, createUserRefreshFn } from '../user-routes.js';
import { COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_CSRF } from '../user-cookies.js';
import bcryptjs from 'bcryptjs';

// Minimal no-op ICache stub used to satisfy machine auth service constructor.
// Machine auth endpoints are not exercised in this test suite.
const fakeCache: ICache = {
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  clear: async () => {},
} as unknown as ICache;

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const SESSION_OPTS: SessionsStoreOptions = { refreshTtlMs: HOUR, graceWindowMs: 5_000 };
const JWT: JwtConfig = { secret: 'test-secret-at-least-32-chars-long!!' };
const TENANT_ID = 'kb-cloud';
const HOST = `${TENANT_ID}.kblabs.ru`;

// ── App factory ───────────────────────────────────────────────────────────────

interface TestCtx {
  app: FastifyInstance;
  users: UsersStore;
  credentials: CredentialsStore;
  memberships: MembershipsStore;
  sessions: SessionsStore;
  invites: InvitesStore;
}

async function buildApp(): Promise<TestCtx> {
  const docs = createInMemoryDocumentDatabase();

  const users = new UsersStore(docs);
  const credentials = new CredentialsStore(docs);
  const memberships = new MembershipsStore(docs);
  const sessions = new SessionsStore(docs, SESSION_OPTS);
  const invites = new InvitesStore(docs);
  const providers = new ProviderRegistry();

  const emailPwd = createEmailPasswordProvider({
    users,
    credentials,
    tenantId: TENANT_ID,
    bcryptCost: 4,
  });
  providers.register(emailPwd);

  const pdp = createStubPDP({ memberships });

  const passwordPolicy = createPasswordPolicy({
    minLength: 8,
    maxLength: 256,
    hibpEnabled: false,
  });

  const userAuthService = createUserAuthService({
    users,
    credentials,
    memberships,
    sessions,
    invites,
    providers,
    passwordPolicy,
    jwtConfig: JWT,
    accessTtlSec: 900,
    refreshTtlSec: HOUR / 1000,
    bcryptCost: 4,
  });

  const tenantResolver = createTenantResolver({ pattern: '{tenant}.kblabs.ru' });

  const userRouteDeps = {
    userAuthService,
    users,
    sessions,
    invites,
    providers,
    pdp,
    tenantResolver,
    cookieOpts: { cookieSecure: false },
    accessTtlSec: 900,
    refreshTtlSec: HOUR / 1000,
    inviteTtlMs: HOUR,
    jwtConfig: JWT,
  };

  // Machine auth service — used only to satisfy registerAuthRoutes constructor.
  // Machine endpoints (register, token) are not exercised in this test suite.
  const machineAuthService = new AuthService(fakeCache, JWT);

  const userExt: MachineAuthRoutesUserExt = {
    userRefreshFn: createUserRefreshFn({
      userAuthService,
      cookieOpts: { cookieSecure: false },
    }),
    pdp,
  };

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(fastifyCookie);

  // User-auth middleware runs first (before machine Bearer check).
  app.addHook('onRequest', createUserAuthMiddleware({ users, tenantResolver, jwtConfig: JWT }));

  // Machine auth middleware — skips if userAuthContext already set.
  app.addHook('onRequest', createAuthMiddleware(fakeCache, JWT));

  // Machine routes (/auth/register, /auth/token, /auth/refresh with user cookie ext).
  registerAuthRoutes(app, machineAuthService, userExt);

  // User-auth routes (all new user endpoints + /auth/me).
  registerUserAuthRoutes(app, userRouteDeps);

  await app.ready();
  return { app, users, credentials, memberships, sessions, invites };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

/**
 * Creates an admin user directly (not via bootstrap) with a bcrypt-hashed
 * password so the login flow works correctly.
 */
async function seedAdmin(
  ctx: Pick<TestCtx, 'users' | 'credentials' | 'memberships'>,
  opts: { userId?: string; tenantId?: string; email?: string; password?: string } = {},
): Promise<{ userId: string; tenantId: string; email: string; password: string }> {
  const userId = opts.userId ?? 'admin-1';
  const tenantId = opts.tenantId ?? TENANT_ID;
  const email = opts.email ?? 'admin@test.com';
  const password = opts.password ?? 'Password123!';

  await ctx.users.create({ userId, tenantId, email, status: 'active' });
  const hash = await bcryptjs.hash(password, 4);
  await ctx.credentials.setCredential({ userId, providerId: 'email-password', hash });
  await ctx.memberships.addMembership({ userId, tenantId, groupId: 'tenant-admin' });

  return { userId, tenantId, email, password };
}

/**
 * Performs a login and returns the cookies as a single header string.
 */
async function loginAndGetCookies(
  app: FastifyInstance,
  opts: { email: string; password: string; host?: string },
): Promise<{ cookieHeader: string; csrfToken: string }> {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { host: opts.host ?? HOST },
    payload: { email: opts.email, password: opts.password },
  });

  if (r.statusCode !== 200) {
    throw new Error(`Login failed: ${r.statusCode} ${r.body}`);
  }

  const setCookies = r.headers['set-cookie'] as string[] | string | undefined;
  const cookieList = Array.isArray(setCookies) ? setCookies : [setCookies ?? ''];

  const parsed: Record<string, string> = {};
  for (const c of cookieList) {
    const [kv] = c.split(';');
    if (!kv) {continue;}
    const eq = kv.indexOf('=');
    if (eq > 0) {
      parsed[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
    }
  }

  const cookieHeader = Object.entries(parsed)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return { cookieHeader, csrfToken: parsed[COOKIE_CSRF] ?? '' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns 200 and sets three session cookies on success', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      payload: { email: 'admin@test.com', password: 'Password123!' },
    });

    expect(r.statusCode).toBe(200);
    const cookies = r.headers['set-cookie'] as string[];
    const names = cookies.map((c) => c.split('=')[0]);
    expect(names).toContain(COOKIE_ACCESS);
    expect(names).toContain(COOKIE_REFRESH);
    expect(names).toContain(COOKIE_CSRF);
  });

  it('returns 401 with { error: "invalid_credentials" } on wrong password (CD-8)', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      payload: { email: 'admin@test.com', password: 'WrongPassword99!' },
    });

    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ error: 'invalid_credentials' });
  });

  it('returns 401 with identical shape on unknown email (CD-8)', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      payload: { email: 'nobody@test.com', password: 'Password123!' },
    });

    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ error: 'invalid_credentials' });
  });

  it('returns 400 when email is missing', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      payload: { password: 'Password123!' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { host: HOST },
      payload: { email: 'admin@test.com' },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('POST /auth/logout', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('clears session cookies on logout with valid CSRF', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });

    expect(r.statusCode).toBe(200);
    const setCookies = r.headers['set-cookie'] as string[];
    // Cookies should be cleared (Max-Age=0).
    const cleared = setCookies.filter((c) => c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'));
    expect(cleared.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 when no session cookie is present', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns 403 when CSRF token header is missing', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { host: HOST, cookie: cookieHeader },
      // No x-csrf-token header.
    });

    expect(r.statusCode).toBe(403);
  });

  it('returns 403 when CSRF token does not match cookie value', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': 'wrong-csrf-token' },
    });

    expect(r.statusCode).toBe(403);
  });
});

describe('POST /auth/refresh (user cookie path)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('rotates the refresh cookie and issues new access + refresh cookies', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    const setCookies = r.headers['set-cookie'] as string[];
    const names = setCookies.map((c) => c.split('=')[0]);
    expect(names).toContain(COOKIE_ACCESS);
    expect(names).toContain(COOKIE_REFRESH);
  });

  it('falls back to machine body path (400) when no cookie and no body', async () => {
    // No cookie, no body → machine refresh path → 400 (missing refreshToken).
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(400);
  });

  it('returns 401 for a tampered refresh cookie', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { host: HOST, cookie: `${COOKIE_REFRESH}=not-a-jwt` },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('GET /auth/me (user context)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns userId, email, tenantId for cookie-auth user', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      userId: 'admin-1',
      email: 'admin@test.com',
      tenantId: TENANT_ID,
    });
  });

  it('does NOT include role or group fields in the response', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: HOST, cookie: cookieHeader },
    });

    const body = r.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('group');
    expect(body).not.toHaveProperty('groupId');
  });

  it('returns 401 without any auth', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('GET /auth/providers', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
  });

  it('returns list of registered providers without auth', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/providers',
      headers: { host: HOST },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json() as { providers: { id: string; kind: string }[] };
    expect(body.providers).toContainEqual({ id: 'email-password', kind: 'password' });
  });
});

describe('GET /auth/permissions', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns permissions list for authenticated admin', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/permissions',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json() as { permissions: string[] };
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions).toContain('users:read');
    expect(body.permissions).toContain('invites:write');
  });

  it('returns 401 without cookie', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/permissions',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('POST /auth/activate', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('activates invite and auto-logs in (sets session cookies)', async () => {
    const inviteRes = await ctx.invites.createInvite({
      email: 'new@test.com',
      tenantId: TENANT_ID,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/activate',
      headers: { host: HOST },
      payload: { token: inviteRes.activationToken, password: 'NewPassword123!' },
    });

    expect(r.statusCode).toBe(200);
    const cookies = r.headers['set-cookie'] as string[];
    expect(cookies.map((c) => c.split('=')[0])).toContain(COOKIE_ACCESS);
  });

  it('returns 401 for an invalid token', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/activate',
      headers: { host: HOST },
      payload: { token: 'totally-invalid-token', password: 'NewPassword123!' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns 400 when token is missing', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/activate',
      headers: { host: HOST },
      payload: { password: 'NewPassword123!' },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('POST /auth/password/change', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('changes password successfully with CSRF', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { currentPassword: 'Password123!', newPassword: 'NewPassword456!' },
    });

    expect(r.statusCode).toBe(200);
  });

  it('returns 400 when current password is wrong', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { currentPassword: 'WrongCurrent!', newPassword: 'NewPassword456!' },
    });

    expect(r.statusCode).toBe(400);
  });

  it('returns 401 without session cookie', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { host: HOST },
      payload: { currentPassword: 'Password123!', newPassword: 'NewPassword456!' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns 403 without CSRF token', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/password/change',
      headers: { host: HOST, cookie: cookieHeader },
      payload: { currentPassword: 'Password123!', newPassword: 'NewPassword456!' },
    });

    expect(r.statusCode).toBe(403);
  });
});

describe('GET /auth/sessions', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns session list including the current session', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json() as { sessions: { familyId: string; isCurrent: boolean }[] };
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(body.sessions.some((s) => s.isCurrent)).toBe(true);
  });
});

describe('POST /auth/sessions/:fam/revoke', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('revokes a target session family', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    // Create a second session to revoke.
    const secondSession = await ctx.sessions.createSession({
      userId: 'admin-1',
      tenantId: TENANT_ID,
      deviceCtx: {},
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: `/auth/sessions/${secondSession.familyId}/revoke`,
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });

    expect(r.statusCode).toBe(200);
  });

  it('returns 403 without CSRF token', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/sessions/some-fam/revoke',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(403);
  });
});

describe('POST /auth/sessions/revoke-all', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('revokes all sessions except current', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    // Create extra sessions to be revoked.
    await ctx.sessions.createSession({ userId: 'admin-1', tenantId: TENANT_ID, deviceCtx: {} });
    await ctx.sessions.createSession({ userId: 'admin-1', tenantId: TENANT_ID, deviceCtx: {} });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/sessions/revoke-all',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });

    expect(r.statusCode).toBe(200);
  });
});

describe('POST /auth/invites (admin only)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('creates an invite and returns activationUrl (admin)', async () => {
    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/invites',
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
      payload: { email: 'newguy@test.com', groupId: 'tenant-member' },
    });

    expect(r.statusCode).toBe(201);
    const body = r.json() as { activationUrl: string; inviteId: string };
    expect(body.activationUrl).toContain('/activate?token=');
    expect(body.inviteId).toBeTruthy();
  });

  it('returns 403 for a non-admin member', async () => {
    // Create a member via invite flow (they get a real bcrypt hash via activate).
    const inviteRes = await ctx.invites.createInvite({
      email: 'member@test.com',
      tenantId: TENANT_ID,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });
    const activateRes = await ctx.app.inject({
      method: 'POST',
      url: '/auth/activate',
      headers: { host: HOST },
      payload: { token: inviteRes.activationToken, password: 'MemberPass123!' },
    });
    expect(activateRes.statusCode).toBe(200);

    // Extract member cookies.
    const memberCookies = (activateRes.headers['set-cookie'] as string[])
      .map((c) => c.split(';')[0] ?? '')
      .join('; ');
    const csrfCookieStr = (activateRes.headers['set-cookie'] as string[])
      .find((c) => c.startsWith(COOKIE_CSRF + '='));
    const memberCsrf = csrfCookieStr
      ? (csrfCookieStr.split(';')[0] ?? '').split('=').slice(1).join('=')
      : '';

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/invites',
      headers: { host: HOST, cookie: memberCookies, 'x-csrf-token': memberCsrf },
      payload: { email: 'another@test.com', groupId: 'tenant-member' },
    });

    expect(r.statusCode).toBe(403);
  });
});

describe('GET /auth/invites (admin only)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns invite list for admin', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/invites',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json() as { invites: unknown[] };
    expect(Array.isArray(body.invites)).toBe(true);
  });
});

describe('GET /auth/users (admin only)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('returns user list including admin for tenant', async () => {
    const { cookieHeader } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/users',
      headers: { host: HOST, cookie: cookieHeader },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json() as { users: { userId: string }[] };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.some((u) => u.userId === 'admin-1')).toBe(true);
  });
});

describe('POST /auth/users/:id/disable (admin only, CD-1)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('disables user and their next request with valid access token returns 401 (CD-1)', async () => {
    // Create a member via invite + activate (they get real cookies).
    const inviteRes = await ctx.invites.createInvite({
      email: 'victim@test.com',
      tenantId: TENANT_ID,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });

    const activateRes = await ctx.app.inject({
      method: 'POST',
      url: '/auth/activate',
      headers: { host: HOST },
      payload: { token: inviteRes.activationToken, password: 'VictimPass123!' },
    });
    expect(activateRes.statusCode).toBe(200);

    const victimCookies = (activateRes.headers['set-cookie'] as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    // Victim can access /auth/me before disable.
    const beforeDisable = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: HOST, cookie: victimCookies },
    });
    expect(beforeDisable.statusCode).toBe(200);
    const victimId = (beforeDisable.json() as { userId: string }).userId;

    // Admin disables victim.
    const { cookieHeader: adminCookies, csrfToken: adminCsrf } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const disableRes = await ctx.app.inject({
      method: 'POST',
      url: `/auth/users/${victimId}/disable`,
      headers: { host: HOST, cookie: adminCookies, 'x-csrf-token': adminCsrf },
    });
    expect(disableRes.statusCode).toBe(200);

    // CD-1: victim's next request with still-valid access token → 401.
    const afterDisable = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: HOST, cookie: victimCookies },
    });
    expect(afterDisable.statusCode).toBe(401);
  });
});

describe('POST /auth/users/:id/enable (admin only)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('re-enables a disabled user', async () => {
    await ctx.users.create({
      userId: 'sleeper',
      tenantId: TENANT_ID,
      email: 'sleeper@test.com',
      status: 'disabled',
    });

    const { cookieHeader: adminCookies, csrfToken: adminCsrf } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/users/sleeper/enable',
      headers: { host: HOST, cookie: adminCookies, 'x-csrf-token': adminCsrf },
    });
    expect(r.statusCode).toBe(200);

    const updated = await ctx.users.getById('sleeper');
    expect(updated?.status).toBe('active');
  });
});

describe('POST /auth/invites/:id/revoke (admin only)', () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await buildApp();
    await seedAdmin(ctx);
  });

  it('revokes a pending invite', async () => {
    const { inviteId } = await ctx.invites.createInvite({
      email: 'tobrevoked@test.com',
      tenantId: TENANT_ID,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });

    const { cookieHeader, csrfToken } = await loginAndGetCookies(ctx.app, {
      email: 'admin@test.com',
      password: 'Password123!',
    });

    const r = await ctx.app.inject({
      method: 'POST',
      url: `/auth/invites/${inviteId}/revoke`,
      headers: { host: HOST, cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });

    expect(r.statusCode).toBe(200);
  });
});
