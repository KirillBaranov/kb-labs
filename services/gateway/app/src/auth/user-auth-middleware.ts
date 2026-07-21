/**
 * @module @kb-labs/gateway-app/auth/user-auth-middleware
 *
 * Fastify onRequest hook for cookie-based user authentication
 * (ADR-0020, Phase 1.16).
 *
 * Runs BEFORE the existing machine-token middleware. Also accepts a user
 * access token via `Authorization: Bearer` when no `kb_access` cookie is
 * present — this is how the CLI (which has nowhere to hold a cookie) carries
 * a human session obtained from `POST /auth/login/cli`. User and machine
 * access tokens are disambiguated by an explicit `type` claim (`'user'` vs.
 * a machine `TokenType`), so a machine Bearer token presented here simply
 * fails `verifyUserAccessToken` and falls through to the machine middleware
 * — see the Bearer branch below.
 *
 * Four outcomes:
 *
 * - **No `kb_access` cookie, no Bearer token** — middleware is a no-op.
 *   Downstream (Bearer-based machine auth) takes over.
 * - **Cookie or Bearer present, valid, user active in correct tenant** —
 *   sets `request.userAuthContext` with `{ type, userId, tenantId,
 *   familyId }` and lets the request through.
 * - **Cookie present but invalid in any way** — returns 401 WITHOUT
 *   falling through to machine auth. A tampered cookie must not
 *   silently bypass into the Bearer path.
 * - **Bearer token present but not a valid user token** (wrong `type`,
 *   bad signature, expired) — falls through silently (no 401) so a
 *   genuine machine Bearer token still reaches the machine middleware.
 *   Only a cookie failure is a hard stop; an absent/invalid Bearer value
 *   must not block the machine-auth path from getting its own chance.
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
import { extractBearerToken } from './tokens.js';

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
    const cookieToken = cookies?.[COOKIE_ACCESS];
    const bearerToken = cookieToken ? undefined : extractBearerToken(request.headers.authorization);
    const token = cookieToken ?? bearerToken;
    if (!token) {
      // No user cookie, no Bearer token — let machine middleware handle it.
      return;
    }

    const payload = await verifyUserAccessToken(token, deps.jwtConfig);
    if (!payload) {
      if (cookieToken) {
        // A tampered/expired cookie must not silently fall through.
        return sendUnauthorized(reply, 'Invalid session');
      }
      // Bearer token present but not a valid user token (e.g. a machine
      // JWT, which carries a different `type` claim) — fall through so
      // the machine middleware gets a chance to verify it instead.
      return;
    }

    // Cross-tenant guard. The cookie alone doesn't tell us "which
    // tenant origin" the browser thinks it's on — we re-derive from
    // Host so a stolen cookie cannot be presented on another tenant.
    //
    // Guard fires only when the Host resolves to a known tenant. When
    // resolvedTenant is null (localhost, raw IP, development, E2E), the
    // request is not subdomain-routed and we cannot enforce per-tenant
    // isolation — let it through. An attacker cannot fake a legitimate
    // tenant subdomain without also controlling DNS / TLS, so the guard
    // only needs to activate when the resolver returns a concrete slug.
    const hostHeader = request.headers['host'];
    const resolvedTenant = deps.tenantResolver.resolve(
      typeof hostHeader === 'string' ? hostHeader : undefined,
    );
    if (resolvedTenant !== null && resolvedTenant !== payload.tenantId) {
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
