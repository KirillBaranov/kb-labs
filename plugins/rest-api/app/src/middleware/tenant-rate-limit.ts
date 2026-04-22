/**
 * @module @kb-labs/rest-api-app/middleware/tenant-rate-limit
 * Wires TenantRateLimiter (backed by platform.cache) into Fastify.
 */

import type { FastifyInstance } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import { TenantRateLimiter } from '@kb-labs/core-tenant';
import { createRateLimitMiddleware, extractTenantId } from './rate-limit';

/**
 * Register tenant-aware rate limiting as a global preHandler hook.
 *
 * Uses platform.cache as the backing store — same adapter that all other
 * platform components use (memory in dev, Redis in prod, etc.).
 */
export function registerTenantRateLimitMiddleware(
  server: FastifyInstance,
  cache: ICache
): void {
  const limiter = new TenantRateLimiter(cache);
  const handler = createRateLimitMiddleware(limiter);
  server.addHook('preHandler', handler);
}

export { TenantRateLimiter, extractTenantId };
