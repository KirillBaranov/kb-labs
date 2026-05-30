/**
 * Integration test: HTTP route guards against the REAL RBAC engine
 * (ClickUp 869def338) — not the stub.
 *
 * Closes the gap that `user-routes.test.ts` leaves open: that suite proves the
 * wiring (middleware → requirePermission → pdp → 403/200) with `createStubPDP`.
 * Here we wire the production `createDocumentBackedPolicy` over seeded policy
 * stores and assert real decisions flow through the actual Fastify routes:
 *   - admin (tenant-admin → all permissions) reaches admin-gated endpoints (200)
 *   - member (tenant-member → none) is denied (403)
 *   - GET /auth/permissions reflects the real engine's enumerate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import {
  UsersStore,
  CredentialsStore,
  MembershipsStore,
  SessionsStore,
  InvitesStore,
  ProviderRegistry,
  createTenantResolver,
  createUserAuthService,
  createEmailPasswordProvider,
  createPasswordPolicy,
  GroupsStore,
  GroupPermissionsStore,
  PolicyMembershipsStore,
  ensurePolicyBootstrap,
  TENANT_MEMBER_GROUP,
} from '@kb-labs/gateway-auth';
import { createDocumentBackedPolicy } from '@kb-labs/core-policy-runtime';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import bcryptjs from 'bcryptjs';
import { createUserAuthMiddleware } from '../user-auth-middleware.js';
import { registerUserAuthRoutes } from '../user-routes.js';

const TENANT_ID = 'kblabs-cloud';
const HOST = 'kblabs-cloud.kblabs.ru';
const JWT = { secret: 'test-secret-real-pdp' };
const ADMIN = { email: 'admin@test.com', password: 'Password123!' };
const MEMBER = { email: 'member@test.com', password: 'Password123!' };
const silentLogger = { warn: () => {}, info: () => {} };

async function buildServer(): Promise<FastifyInstance> {
  const docs = createInMemoryDocumentDatabase();

  const users = new UsersStore(docs);
  const credentials = new CredentialsStore(docs);
  const sessions = new SessionsStore(docs, { refreshTtlMs: 3_600_000, graceWindowMs: 5_000 });
  const invites = new InvitesStore(docs);

  // RBAC seed stores + the REAL PDP over the SAME documentDatabase.
  const groups = new GroupsStore(docs);
  const groupPermissions = new GroupPermissionsStore(docs);
  const policyMemberships = new PolicyMembershipsStore(docs);
  const pdp = createDocumentBackedPolicy(docs);

  // Two users with login credentials.
  for (const u of [ADMIN, MEMBER]) {
    const userId = `${u.email}-id`;
    await users.create({ userId, tenantId: TENANT_ID, email: u.email, status: 'active' });
    await credentials.setCredential({
      userId,
      providerId: 'email-password',
      hash: await bcryptjs.hash(u.password, 4),
    });
  }

  // Seed RBAC: tenant-admin → all permissions (+ admin membership), tenant-member → none.
  await ensurePolicyBootstrap({
    groups,
    groupPermissions,
    policyMemberships,
    users,
    tenantId: TENANT_ID,
    adminEmail: ADMIN.email,
    logger: silentLogger,
  });
  await policyMemberships.addGroup(`${MEMBER.email}-id`, TENANT_ID, TENANT_MEMBER_GROUP);

  const providers = new ProviderRegistry();
  providers.register(
    createEmailPasswordProvider({ users, credentials, tenantId: TENANT_ID, bcryptCost: 4 }),
  );

  const userAuthService = createUserAuthService({
    users,
    credentials,
    memberships: new MembershipsStore(docs), // login path only; PDP reads policy stores
    sessions,
    invites,
    providers,
    passwordPolicy: createPasswordPolicy({ minLength: 8, maxLength: 256, hibpEnabled: false }),
    jwtConfig: JWT,
    accessTtlSec: 900,
    refreshTtlSec: 3600,
    bcryptCost: 4,
  });

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(fastifyCookie);
  app.addHook(
    'onRequest',
    createUserAuthMiddleware({ users, tenantResolver: createTenantResolver({ pattern: '{tenant}.kblabs.ru' }), jwtConfig: JWT }),
  );
  registerUserAuthRoutes(app, {
    userAuthService,
    users,
    sessions,
    invites,
    providers,
    pdp,
    tenantResolver: createTenantResolver({ pattern: '{tenant}.kblabs.ru' }),
    cookieOpts: { cookieSecure: false },
    accessTtlSec: 900,
    refreshTtlSec: 3600,
    inviteTtlMs: 3_600_000,
    jwtConfig: JWT,
  });
  await app.ready();
  return app;
}

async function login(app: FastifyInstance, creds: { email: string; password: string }): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { host: HOST },
    payload: creds,
  });
  if (r.statusCode !== 200) {
    throw new Error(`login failed ${r.statusCode}: ${r.body}`);
  }
  const set = r.headers['set-cookie'];
  const list = Array.isArray(set) ? set : [set ?? ''];
  return list.map((c) => c.split(';')[0]).join('; ');
}

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildServer();
});

describe('HTTP route guards × real RBAC engine', () => {
  it('admin (tenant-admin → all) reaches an admin-gated endpoint (200)', async () => {
    const cookies = await login(app, ADMIN);
    const r = await app.inject({ method: 'GET', url: '/auth/users', headers: { host: HOST, cookie: cookies } });
    expect(r.statusCode).toBe(200);
  });

  it('member (tenant-member → none) is denied the same endpoint (403)', async () => {
    const cookies = await login(app, MEMBER);
    const r = await app.inject({ method: 'GET', url: '/auth/users', headers: { host: HOST, cookie: cookies } });
    expect(r.statusCode).toBe(403);
  });

  it('GET /auth/permissions reflects the real engine — admin holds users:write, member holds nothing', async () => {
    const adminCookies = await login(app, ADMIN);
    const adminPerms = await app.inject({ method: 'GET', url: '/auth/permissions', headers: { host: HOST, cookie: adminCookies } });
    expect(adminPerms.statusCode).toBe(200);
    expect(adminPerms.json().permissions).toContain(PERMISSIONS.USERS_WRITE);

    const memberCookies = await login(app, MEMBER);
    const memberPerms = await app.inject({ method: 'GET', url: '/auth/permissions', headers: { host: HOST, cookie: memberCookies } });
    expect(memberPerms.statusCode).toBe(200);
    expect(memberPerms.json().permissions).toEqual([]);
  });
});
