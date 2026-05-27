/**
 * Tests for the user-auth Fastify middleware (ADR-0020, Phase 1.16).
 *
 * Reads the `kb_access` cookie, verifies the user JWT, enforces CD-1
 * (User.status active on every request) and the cross-tenant guard
 * (payload.tenantId === tenantResolver(Host)), and attaches a
 * user-flavoured AuthContext to the request.
 *
 * No cookie → the middleware does NOT short-circuit; downstream
 * (Bearer-based machine auth) gets a chance.
 *
 * Cookie present but bad → 401 (don't fall through, otherwise a
 * tampered cookie could silently bypass into Bearer auth).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import {
  UsersStore,
  MembershipsStore,
  SessionsStore,
  createTenantResolver,
  signUserAccessToken,
  type JwtConfig,
} from '@kb-labs/gateway-auth';
import { createUserAuthMiddleware } from '../user-auth-middleware.js';
import { COOKIE_ACCESS } from '../user-cookies.js';

const HOUR = 60 * 60 * 1000;
const jwtConfig: JwtConfig = { secret: 'test-secret-at-least-32-chars-long!!' };

let app!: FastifyInstance;
let users!: UsersStore;
let memberships!: MembershipsStore;
let sessions!: SessionsStore;

beforeEach(async () => {
  const docs = createInMemoryDocumentDatabase();
  users = new UsersStore(docs);
  memberships = new MembershipsStore(docs);
  sessions = new SessionsStore(docs, { refreshTtlMs: HOUR, graceWindowMs: 5_000 });

  app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  app.addHook('onRequest', createUserAuthMiddleware({
    users,
    tenantResolver: createTenantResolver({ pattern: '{tenant}.kblabs.ru' }),
    jwtConfig,
  }));

  app.get('/echo', async (req) => ({
    auth: req.userAuthContext ?? null,
  }));

  await app.ready();
});

const seedUserAndToken = async (
  opts: { userId: string; tenantId: string; status: 'active' | 'pending' | 'disabled' } = {
    userId: 'u1', tenantId: 'kblabs-cloud', status: 'active',
  },
) => {
  await users.create({
    userId: opts.userId,
    tenantId: opts.tenantId,
    email: 'a@x.com',
    status: opts.status,
  });
  const sess = await sessions.createSession({
    userId: opts.userId,
    tenantId: opts.tenantId,
    deviceCtx: {},
  });
  const { token } = await signUserAccessToken({
    userId: opts.userId,
    tenantId: opts.tenantId,
    familyId: sess.familyId,
    ttlSec: 900,
  }, jwtConfig);
  return { token, familyId: sess.familyId };
};

describe('no cookie present', () => {
  it('does not set authContext; downstream is free to authenticate by Bearer', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().auth).toBeNull();
  });
});

describe('happy path', () => {
  it('sets authContext to a user with userId, tenantId, familyId', async () => {
    const { token, familyId } = await seedUserAndToken();
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().auth).toMatchObject({
      type: 'user',
      userId: 'u1',
      tenantId: 'kblabs-cloud',
      familyId,
    });
  });
});

describe('bad cookie', () => {
  it('returns 401 for a malformed JWT (does NOT fall through)', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru', cookie: `${COOKIE_ACCESS}=not-a-jwt` },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns 401 for a JWT signed with a different secret', async () => {
    const { token: foreign } = await signUserAccessToken(
      { userId: 'u1', tenantId: 'kblabs-cloud', familyId: 'f', ttlSec: 900 },
      { secret: 'other-secret-32-chars-or-more-now-pls' },
    );
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru', cookie: `${COOKIE_ACCESS}=${foreign}` },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('CD-1: middleware checks User.status on every request', () => {
  it('rejects a request from a disabled user even if access token is still valid', async () => {
    const { token } = await seedUserAndToken();
    await users.setStatus('u1', 'disabled');
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    expect(r.statusCode).toBe(401);
  });

  it('rejects when the user no longer exists', async () => {
    const { token } = await seedUserAndToken();
    await users.delete('u1');
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'kblabs-cloud.kblabs.ru', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('cross-tenant guard', () => {
  it('rejects a cookie issued for tenant A presented on tenant B subdomain', async () => {
    const { token } = await seedUserAndToken({ userId: 'u1', tenantId: 'kblabs-cloud', status: 'active' });
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'other-tenant.kblabs.ru', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    expect(r.statusCode).toBe(401);
  });

  // When the host resolves to null (reserved subdomain, localhost, raw IP, etc.)
  // the guard cannot enforce tenant isolation and lets the request through.
  // In production, SameSite=Strict + no Domain= prevents cookies from reaching
  // non-tenant hosts in the first place. This case covers E2E / dev environments
  // where the gateway runs on localhost:4000 with no tenant subdomain.
  it('allows request when host resolves to null (reserved subdomain / localhost)', async () => {
    const { token } = await seedUserAndToken();
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'api.kblabs.ru', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    // null resolution → guard does not fire → request reaches the handler
    expect(r.statusCode).toBe(200);
  });

  it('allows request from localhost (E2E / dev — no subdomain routing)', async () => {
    const { token } = await seedUserAndToken();
    const r = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { host: 'localhost:4000', cookie: `${COOKIE_ACCESS}=${token}` },
    });
    expect(r.statusCode).toBe(200);
  });
});

void sessions; // silences "declared but unused" if a future refactor drops a reference
void memberships;
