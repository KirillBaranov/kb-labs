import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import { verifyAccessToken, type JwtConfig } from '@kb-labs/gateway-auth';

const PUBLIC_ROUTES = new Set([
  '/health',
  '/ready',
  '/metrics',
  '/observability/describe',
  '/observability/health',
  '/docs',
  '/docs/json',
]);

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export function createRegistryAuthMiddleware(jwtConfig: JwtConfig) {
  return async function registryAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (PUBLIC_ROUTES.has(pathname) || pathname.startsWith('/docs')) { return; }

    // Public read-only routes — no auth needed
    if (request.method === 'GET' && (
      pathname.startsWith('/api/v1/packages') ||
      pathname.startsWith('/api/v1/my')  // will be caught by requireAuth in route
    )) {
      // still attempt auth so authContext is set if token is present
    }

    const authHeader = request.headers.authorization;
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
    if (!token) { return; } // public routes proceed without authContext; protected routes use requireAuth

    const payload = await verifyAccessToken(token, jwtConfig);
    if (!payload) {
      // Token present but invalid — reject immediately
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }

    request.authContext = {
      type: payload.type,
      userId: payload.sub ?? '',
      namespaceId: payload.namespaceId,
      tier: payload.tier,
      permissions: ['host:connect'],
    };
  };
}
