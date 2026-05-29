/**
 * @module @kb-labs/rest-api-app/middleware/tenant-rate-limit
 * Wires TenantRateLimiter (backed by platform.cache) into Fastify.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import { TenantRateLimiter, getDefaultTenantTier } from '@kb-labs/core-tenant';

interface TenantRateLimiterLike {
  checkLimit(tenantId: string, resource: string): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
  }>;
}

export function extractTenantId(request: FastifyRequest): string {
  return (
    (request.headers['x-tenant-id'] as string) ||
    process.env.KB_TENANT_ID ||
    'default'
  );
}

export function createRateLimitMiddleware(rateLimiter: TenantRateLimiterLike) {
  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const tenantId = extractTenantId(request);
    const result = await rateLimiter.checkLimit(tenantId, 'requests');

    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter);
      return reply.code(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter,
        limit: result.limit,
        resetAt: new Date(result.resetAt).toISOString(),
      });
    }

    request.tenantId = tenantId;
  };
}

/**
 * Register tenant-aware rate limiting as a global preHandler hook.
 *
 * Uses platform.cache as the backing store — same adapter that all other
 * platform components use (memory in dev, Redis in prod, etc.).
 *
 * The 'default' tenant (used when no X-Tenant-ID header is present) gets the
 * tier from KB_TENANT_DEFAULT_TIER env var (defaults to 'free' if unset).
 * In E2E / self-hosted environments set KB_TENANT_DEFAULT_TIER=enterprise to
 * avoid hitting the 10 req/min free-tier rate limit.
 */
export function registerTenantRateLimitMiddleware(
  server: FastifyInstance,
  cache: ICache
): void {
  const limiter = new TenantRateLimiter(cache);
  // Apply the environment-configured tier to the 'default' tenant so that
  // unauthenticated / single-tenant deployments respect KB_TENANT_DEFAULT_TIER.
  limiter.setTier('default', getDefaultTenantTier());
  const handler = createRateLimitMiddleware(limiter);
  server.addHook('preHandler', handler);
}

export { TenantRateLimiter };
