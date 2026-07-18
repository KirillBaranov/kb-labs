import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import { resolveToken, extractBearerToken } from './tokens.js';

/**
 * Deterministic identity used when auth is disabled (solo/local mode). All
 * requests run as this single local admin so namespaced data and audit logs
 * stay coherent, and enabling auth later does not invalidate existing data.
 */
export const LOCAL_ADMIN_CONTEXT: AuthContext = {
  type: 'machine',
  userId: 'local-admin',
  namespaceId: 'local',
  tier: 'enterprise',
  permissions: Object.values(PERMISSIONS),
};

// Routes that don't require auth (handle their own auth internally)
const PUBLIC_ROUTES = new Set([
  '/health',
  '/health/adapters',
  '/ready',
  // Module Federation manifest — static, non-sensitive metadata describing
  // available Studio remotes. The Studio SPA shell must be able to fetch
  // this before a user has logged in (there is no session yet to gate on).
  '/mf-manifest.json',
  '/hosts/register',
  // /hosts/connect and /clients/connect are handled at the HTTP upgrade level
  // by gateway-ws.ts (raw ws) — they never reach Fastify routing.
  // NOTE: /auth/register is NOT public — it requires MACHINE_REGISTER permission
  //       (cookie-auth admin or Bearer machine with that permission).
  '/auth/token',
  '/auth/refresh',
  // User-auth public endpoints (ADR-0020, Phase 1.16).
  '/auth/login',
  '/auth/activate',
  '/auth/providers',
  '/internal/dispatch', // has its own x-internal-secret auth
  '/internal/resolve-host', // has its own x-internal-secret auth
]);

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export function createAuthMiddleware(
  cache: ICache,
  jwtConfig: JwtConfig,
  options: { authEnabled?: boolean } = {},
) {
  const authEnabled = options.authEnabled !== false; // default: enabled
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Auth disabled (solo/local mode): every request runs as the local admin.
    // The startup guardrail (bootstrap) guarantees this only happens on a
    // loopback bind, so it never exposes an open platform on the network.
    if (!authEnabled) {
      request.authContext = LOCAL_ADMIN_CONTEXT;
      return;
    }

    const rawPath = new URL(request.url, 'http://localhost').pathname;
    const routePath = rawPath.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
    if (PUBLIC_ROUTES.has(routePath)) {return;}
    // Redirect/OAuth endpoints (ADR-0020, Step 4) are public — they carry no
    // Bearer token (the IdP→callback hop is a top-level browser navigation) and
    // enforce their own state/cookie binding. Prefix match covers /start and
    // /callback for every provider id.
    if (routePath.startsWith('/auth/oauth/')) {return;}

    // Bearer header takes precedence; fall back to ?access_token= for SSE
    // connections where browsers cannot set custom headers.
    const queryToken = (request.query as Record<string, string | undefined>)['access_token'];
    const token = extractBearerToken(request.headers.authorization) ?? queryToken ?? null;

    // Skip machine Bearer check when the request is already user-authenticated
    // via cookie AND no explicit Bearer token was provided.
    // When BOTH cookie and Bearer are present (e.g. a Playwright context that
    // accumulated session cookies while also sending machine credentials), we
    // honour the Bearer token so that machine-auth context (namespaceId, etc.)
    // is populated — critical for per-tenant rate limiting and route permissions.
    if (!token && request.userAuthContext) {return;}

    if (!token) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
    }

    const authContext = await resolveToken(token, cache, jwtConfig);
    if (!authContext) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }

    request.authContext = authContext;
  };
}
