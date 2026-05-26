/**
 * @module @kb-labs/gateway-app/auth/user-auth-middleware
 *
 * Fastify onRequest hook for cookie-based user authentication
 * (ADR-0020, Phase 1.16).
 *
 * Runs BEFORE the existing machine-token middleware. Three outcomes:
 *
 * - **No `kb_access` cookie** — middleware is a no-op. Downstream
 *   (Bearer-based machine auth) takes over.
 * - **Cookie present, valid, user active in correct tenant** — sets
 *   `request.userAuthContext` with `{ type, userId, tenantId,
 *   familyId }` and lets the request through.
 * - **Cookie present but invalid in any way** — returns 401 WITHOUT
 *   falling through to machine auth. A tampered cookie must not
 *   silently bypass into the Bearer path.
 *
 * What this middleware enforces:
 *
 * - **CD-1**: `users.getById(userId).status === 'active'`. The PDP
 *   does not see this; without an explicit check a disabled user
 *   keeps acting for up to one access TTL.
 * - **Cross-tenant guard**: `payload.tenantId ===
 *   tenantResolver(req.host)`. A cookie from tenant A presented on
 *   tenant B's subdomain is rejected.
 */

import type { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import type { UsersStore, JwtConfig, TenantResolver } from '@kb-labs/gateway-auth';
import { verifyUserAccessToken } from '@kb-labs/gateway-auth';
import { COOKIE_ACCESS } from './user-cookies.js';

export interface UserAuthContext {
  type: 'user';
  userId: string;
  tenantId: string;
  familyId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    userAuthContext?: UserAuthContext;
  }
}

export interface UserAuthMiddlewareDeps {
  users: UsersStore;
  tenantResolver: TenantResolver;
  jwtConfig: JwtConfig;
}

const sendUnauthorized = (reply: FastifyReply, message: string) =>
  reply.code(401).send({ error: 'Unauthorized', message });

export const createUserAuthMiddleware = (deps: UserAuthMiddlewareDeps) => {
  return async function userAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void | FastifyError> {
    const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
    const token = cookies?.[COOKIE_ACCESS];
    if (!token) {
      // No user cookie — let machine middleware (Bearer) handle the request.
      return;
    }

    const payload = await verifyUserAccessToken(token, deps.jwtConfig);
    if (!payload) {
      return sendUnauthorized(reply, 'Invalid session');
    }

    // Cross-tenant guard. The cookie alone doesn't tell us "which
    // tenant origin" the browser thinks it's on — we re-derive from
    // Host so a stolen cookie cannot be presented on another tenant.
    const hostHeader = request.headers['host'];
    const resolvedTenant = deps.tenantResolver.resolve(
      typeof hostHeader === 'string' ? hostHeader : undefined,
    );
    if (!resolvedTenant || resolvedTenant !== payload.tenantId) {
      return sendUnauthorized(reply, 'Tenant mismatch');
    }

    // CD-1: explicit user.status check on every request. Without this
    // a disabled user keeps acting for the remaining access TTL.
    const user = await deps.users.getById(payload.userId);
    if (!user || user.status !== 'active') {
      return sendUnauthorized(reply, 'Session no longer valid');
    }

    request.userAuthContext = {
      type: 'user',
      userId: payload.userId,
      tenantId: payload.tenantId,
      familyId: payload.familyId,
    };
  };
};
