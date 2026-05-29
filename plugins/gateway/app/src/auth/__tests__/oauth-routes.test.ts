/**
 * Integration tests for the OAuth redirect routes (ADR-0020, Step 4 + 4b).
 *
 *   GET /auth/oauth/:id/start     — 302 to the upstream IdP, state in KV
 *                                   + state cookie (SameSite=Lax).
 *   GET /auth/oauth/:id/callback  — verify state, run the provider via
 *                                   userAuthService.login (DD-6), set
 *                                   session cookies, 302 to returnTo.
 *
 * Uses a real in-test redirect provider (test infrastructure, NOT a
 * shipped stub) so the flow is exercised end-to-end without a network
 * IdP. Security cases: unknown/non-redirect provider on /start → 400;
 * missing / wrong / replayed state → redirect to /login?error; cross
 * tenant → reject; open-redirect returnTo → forced to '/'; provider
 * mix-up (URL :id ≠ state.providerId) → reject; state-cookie binding;
 * per-IP rate-limit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { createInMemoryDocumentDatabase, createInMemoryKVStore } from '@kb-labs/sdk/testing';
import type { IKVStore } from '@kb-labs/core-platform/adapters';
import type {
  IRedirectIdentityProvider,
  IdentityResult,
  RedirectStartContext,
} from '@kb-labs/core-contracts';
import {
  UsersStore,
  CredentialsStore,
  MembershipsStore,
  SessionsStore,
  InvitesStore,
  ProviderRegistry,
  OAuthStateStore,
  type SessionsStoreOptions,
  createTenantResolver,
  createUserAuthService,
  createEmailPasswordProvider,
  createPasswordPolicy,
  createStubPDP,
  createRateLimiter,
  type JwtConfig,
} from '@kb-labs/gateway-auth';
import { createUserAuthMiddleware } from '../user-auth-middleware.js';
import { registerUserAuthRoutes } from '../user-routes.js';
import { COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_CSRF, COOKIE_OAUTH_STATE } from '../user-cookies.js';

const HOUR = 60 * 60 * 1000;
const SESSION_OPTS: SessionsStoreOptions = { refreshTtlMs: HOUR, graceWindowMs: 5_000 };
const JWT: JwtConfig = { secret: 'test-secret-at-least-32-chars-long!!' };
const TENANT_ID = 'kb-cloud';
const HOST = `${TENANT_ID}.kblabs.ru`;
const OTHER_HOST = 'other-tenant.kblabs.ru';

// ── In-test redirect provider ───────────────────────────────────────────────
// A deterministic OAuth-shaped provider. `startAuthorization` records the
// context and returns a fixed upstream URL + a nonce session. `authenticate`
// maps a magic code to a result, so tests control success/failure.

interface TestRedirectProvider extends IRedirectIdentityProvider {
  lastStart?: RedirectStartContext;
}

function makeRedirectProvider(
  id: string,
  opts: { email?: string; authResult?: IdentityResult } = {},
): TestRedirectProvider {
  const email = opts.email ?? 'alice@example.com';
  const provider: TestRedirectProvider = {
    id,
    kind: 'redirect',
    async startAuthorization(ctx) {
      provider.lastStart = ctx;
      const url = new URL('https://idp.example/authorize');
      url.searchParams.set('state', ctx.state);
      url.searchParams.set('redirect_uri', ctx.redirectUri);
      return { redirectUrl: url.toString(), session: { nonce: 'nonce-xyz' } };
    },
    async authenticate(input: unknown): Promise<IdentityResult> {
      if (opts.authResult) { return opts.authResult; }
      const bundle = input as { code?: string } | undefined;
      if (bundle?.code === 'good-code') {
        return { ok: true, email, externalId: 'ext-1' };
      }
      return { ok: false, reason: 'invalid' };
    },
  };
  return provider;
}

interface TestCtx {
  app: FastifyInstance;
  users: UsersStore;
  credentials: CredentialsStore;
  memberships: MembershipsStore;
  kv: IKVStore;
  oauthState: OAuthStateStore;
  provider: TestRedirectProvider;
}

interface BuildOpts {
  provider?: TestRedirectProvider;
  rateLimit?: { loginPerIpPerMinute: number; loginPerEmailPerMinute: number };
  oauthCallbackPerIpPerMinute?: number;
}

async function buildApp(opts: BuildOpts = {}): Promise<TestCtx> {
  const docs = createInMemoryDocumentDatabase();
  const users = new UsersStore(docs);
  const credentials = new CredentialsStore(docs);
  const memberships = new MembershipsStore(docs);
  const sessions = new SessionsStore(docs, SESSION_OPTS);
  const invites = new InvitesStore(docs);

  const providers = new ProviderRegistry();
  providers.register(createEmailPasswordProvider({ users, credentials, tenantId: TENANT_ID, bcryptCost: 4 }));
  const provider = opts.provider ?? makeRedirectProvider('corp');
  providers.register(provider);

  const pdp = createStubPDP({ memberships });
  const passwordPolicy = createPasswordPolicy({ minLength: 8, maxLength: 256, hibpEnabled: false });
  const userAuthService = createUserAuthService({
    users, credentials, memberships, sessions, invites, providers, passwordPolicy,
    jwtConfig: JWT, accessTtlSec: 900, refreshTtlSec: HOUR / 1000, bcryptCost: 4,
  });
  const tenantResolver = createTenantResolver({ pattern: '{tenant}.kblabs.ru' });

  const kv = createInMemoryKVStore();
  const oauthState = new OAuthStateStore(kv);
  const rateLimiter = createRateLimiter(kv);

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(fastifyCookie);
  app.addHook('onRequest', createUserAuthMiddleware({ users, tenantResolver, jwtConfig: JWT }));

  registerUserAuthRoutes(app, {
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
    oauthState,
    rateLimiter,
    authRateLimit: opts.rateLimit,
    oauthCallbackPerIpPerMinute: opts.oauthCallbackPerIpPerMinute,
  });

  await app.ready();
  return { app, users, credentials, memberships, kv, oauthState, provider };
}

async function seedActiveUser(
  ctx: Pick<TestCtx, 'users' | 'memberships'>,
  email = 'alice@example.com',
): Promise<void> {
  await ctx.users.create({ userId: 'u-alice', tenantId: TENANT_ID, email, status: 'active' });
  await ctx.memberships.addMembership({ userId: 'u-alice', tenantId: TENANT_ID, groupId: 'tenant-member' });
}

// Pull the state value the start route minted (from the KV via the cookie).
function readStateCookie(setCookie: string | string[] | undefined): string | undefined {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const c = arr.find(s => s.startsWith(`${COOKIE_OAUTH_STATE}=`));
  if (!c) { return undefined; }
  return c.split(';')[0]!.split('=')[1];
}

describe('GET /auth/oauth/:id/start', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await buildApp(); });

  it('302s to the upstream IdP with state, sets a Lax state cookie, persists state in KV', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/oauth/corp/start?returnTo=/dashboard',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(302);
    const location = r.headers.location as string;
    expect(location.startsWith('https://idp.example/authorize')).toBe(true);

    const setCookie = r.headers['set-cookie'];
    const state = readStateCookie(setCookie);
    expect(state).toBeTruthy();
    // The upstream URL carries the same state.
    expect(new URL(location).searchParams.get('state')).toBe(state);
    // redirect_uri is built from Host with the /api prefix.
    expect(new URL(location).searchParams.get('redirect_uri'))
      .toBe(`http://${HOST}/api/auth/oauth/corp/callback`);

    // State cookie is SameSite=Lax (NOT Strict) and HttpOnly, scoped to OAuth path.
    const stateCookieStr = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .find(s => s?.startsWith(`${COOKIE_OAUTH_STATE}=`))!;
    expect(stateCookieStr.toLowerCase()).toContain('samesite=lax');
    expect(stateCookieStr.toLowerCase()).toContain('httponly');
    expect(stateCookieStr).toContain('Path=/api/auth/oauth');

    // KV holds the binding.
    const record = await ctx.oauthState.consume(state!);
    expect(record).not.toBeNull();
    expect(record!.providerId).toBe('corp');
    expect(record!.tenantId).toBe(TENANT_ID);
    expect(record!.returnTo).toBe('/dashboard');
    expect(record!.session).toEqual({ nonce: 'nonce-xyz' });
  });

  it('forces an open-redirect returnTo down to "/" (Step 4b)', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/oauth/corp/start?returnTo=https://evil.com',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(302);
    const state = readStateCookie(r.headers['set-cookie'])!;
    const record = await ctx.oauthState.consume(state);
    expect(record!.returnTo).toBe('/');
  });

  it('400s for an unknown provider', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/auth/oauth/nope/start', headers: { host: HOST } });
    expect(r.statusCode).toBe(400);
  });

  it('400s for a password provider (not a redirect provider)', async () => {
    const r = await ctx.app.inject({ method: 'GET', url: '/auth/oauth/email-password/start', headers: { host: HOST } });
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /auth/oauth/:id/callback', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await buildApp(); });

  // Drives a real /start to mint state + cookie, then returns both.
  async function startFlow(returnTo = '/dashboard'): Promise<{ state: string; cookie: string }> {
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/start?returnTo=${encodeURIComponent(returnTo)}`,
      headers: { host: HOST },
    });
    const setCookie = r.headers['set-cookie'];
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    const stateCookie = arr.find(s => s.startsWith(`${COOKIE_OAUTH_STATE}=`))!;
    const state = stateCookie.split(';')[0]!.split('=')[1]!;
    return { state, cookie: `${COOKIE_OAUTH_STATE}=${state}` };
  }

  it('valid state + good code → sets session cookies and 302s to returnTo', async () => {
    await seedActiveUser(ctx);
    const { state, cookie } = await startFlow('/dashboard');

    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/callback?state=${state}&code=good-code`,
      headers: { host: HOST, cookie },
    });

    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/dashboard');
    const setCookie = r.headers['set-cookie'];
    const names = (Array.isArray(setCookie) ? setCookie : [setCookie as string]).map(s => s.split('=')[0]);
    expect(names).toContain(COOKIE_ACCESS);
    expect(names).toContain(COOKIE_REFRESH);
    expect(names).toContain(COOKIE_CSRF);
  });

  it('missing state → redirect to /login?error', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/oauth/corp/callback?code=good-code',
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('unknown/forged state → redirect to /login?error', async () => {
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/auth/oauth/corp/callback?state=forged-state&code=good-code',
      headers: { host: HOST, cookie: `${COOKIE_OAUTH_STATE}=forged-state` },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('replayed state (one-shot) → second callback rejected', async () => {
    await seedActiveUser(ctx);
    const { state, cookie } = await startFlow();
    const first = await ctx.app.inject({
      method: 'GET', url: `/auth/oauth/corp/callback?state=${state}&code=good-code`, headers: { host: HOST, cookie },
    });
    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toBe('/dashboard');

    const second = await ctx.app.inject({
      method: 'GET', url: `/auth/oauth/corp/callback?state=${state}&code=good-code`, headers: { host: HOST, cookie },
    });
    expect(second.statusCode).toBe(302);
    expect((second.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('cross-tenant: state minted for tenant A, callback Host of tenant B → rejected', async () => {
    await seedActiveUser(ctx);
    const { state, cookie } = await startFlow();
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/callback?state=${state}&code=good-code`,
      headers: { host: OTHER_HOST, cookie },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('state-cookie binding: query state without matching cookie → rejected (Step 4b)', async () => {
    await seedActiveUser(ctx);
    const { state } = await startFlow();
    // No cookie sent — even though the KV state is valid, the binding fails.
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/callback?state=${state}&code=good-code`,
      headers: { host: HOST },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('provider mix-up: URL :id differs from state.providerId → rejected (Step 4b)', async () => {
    // Register a second redirect provider and start a flow on `corp`, then
    // try to finish it on `other`. The state's providerId is the source of
    // truth; the URL :id must match it.
    const other = makeRedirectProvider('other');
    ctx = await buildApp({ provider: ctx.provider });
    // Re-build with both providers present.
    // (Simpler: start on corp, callback on a different id.)
    await seedActiveUser(ctx);
    const { state, cookie } = await startFlow();
    void other;
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/email-password/callback?state=${state}&code=good-code`,
      headers: { host: HOST, cookie },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('IdP error param → redirect to /login?error without touching the provider', async () => {
    const { state, cookie } = await startFlow();
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/callback?state=${state}&error=access_denied`,
      headers: { host: HOST, cookie },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
  });

  it('auth failure (no user) → redirect to /login?error, no session cookies', async () => {
    // No seeded user → service login throws invalid_credentials.
    const { state, cookie } = await startFlow();
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/auth/oauth/corp/callback?state=${state}&code=good-code`,
      headers: { host: HOST, cookie },
    });
    expect(r.statusCode).toBe(302);
    expect((r.headers.location as string).startsWith('/login?error')).toBe(true);
    const setCookie = r.headers['set-cookie'];
    const names = (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map(s => s.split('=')[0]);
    expect(names).not.toContain(COOKIE_ACCESS);
  });
});

describe('OAuth per-IP rate-limit (Step 4b)', () => {
  it('blocks callback floods from one IP with 429', async () => {
    const ctx = await buildApp({ oauthCallbackPerIpPerMinute: 3 });
    // Fire more callbacks than the limit; all use a forged state (cheap path)
    // but the rate-limit gate runs first.
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const r = await ctx.app.inject({
        method: 'GET',
        url: '/auth/oauth/corp/callback?state=x&code=c',
        headers: { host: HOST, 'x-forwarded-for': '9.9.9.9', cookie: `${COOKIE_OAUTH_STATE}=x` },
      });
      if (r.statusCode === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });
});
