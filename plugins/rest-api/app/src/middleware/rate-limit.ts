/**
 * @module @kb-labs/rest-api-app/middleware/rate-limit
 * Tenant-aware rate limiting middleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

interface TenantRateLimiter {
  checkLimit(tenantId: string, resource: string): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
  }>;
}

/**
 * Extract tenant ID from request
 * Priority order:
 * 1. Header: X-Tenant-ID
 * 2. Environment: KB_TENANT_ID
 * 3. Default: 'default'
 *
 * @param request - Fastify request
 * @returns Tenant ID
 */
export function extractTenantId(request: FastifyRequest): string {
  return (
    (request.headers['x-tenant-id'] as string) ||
    process.env.KB_TENANT_ID ||
    'default'
  );
}

/**
 * Create rate limiting middleware
 *
 * @param rateLimiter - Tenant rate limiter instance
 * @returns Fastify preHandler hook
 */
export function createRateLimitMiddleware(rateLimiter: TenantRateLimiter) {
  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const tenantId = extractTenantId(request);

    // Check rate limit for requests
    const result = await rateLimiter.checkLimit(tenantId, 'requests');

    // Add rate limit headers (standard X-RateLimit-* headers)
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

    // Store tenantId in request context for downstream use
    request.tenantId = tenantId;
  };
}
