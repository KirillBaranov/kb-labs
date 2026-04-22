/**
 * @module @kb-labs/rest-api-app/middleware/tenant-rate-limit
 * Wires TenantRateLimiter (backed by platform.cache) into Fastify.
 */

import type { FastifyInstance } from 'fastify';
import type { ICache } from '@kb-labs/core-platform';
import { TenantRateLimiter, getDefaultTenantTier } from '@kb-labs/core-tenant';
import { createRateLimitMiddleware, extractTenantId } from './rate-limit';

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

export { TenantRateLimiter, extractTenantId };
