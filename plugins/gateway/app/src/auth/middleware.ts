import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { resolveToken, extractBearerToken } from './tokens.js';

// Routes that don't require auth (handle their own auth internally)
const PUBLIC_ROUTES = new Set([
  '/health',
  '/hosts/register',
  // /hosts/connect and /clients/connect are handled at the HTTP upgrade level
  // by gateway-ws.ts (raw ws) — they never reach Fastify routing.
  '/auth/register',
  '/auth/token',
  '/auth/refresh',
  '/internal/dispatch', // has its own x-internal-secret auth
  '/internal/resolve-host', // has its own x-internal-secret auth
]);

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export function createAuthMiddleware(cache: ICache, jwtConfig: JwtConfig) {
  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const rawPath = new URL(request.url, 'http://localhost').pathname;
    const routePath = rawPath.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
    if (PUBLIC_ROUTES.has(routePath)) {return;}

    // Bearer header takes precedence; fall back to ?access_token= for SSE
    // connections where browsers cannot set custom headers.
    const queryToken = (request.query as Record<string, string | undefined>)['access_token'];
    const token = extractBearerToken(request.headers.authorization) ?? queryToken ?? null;
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
