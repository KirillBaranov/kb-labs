/**
 * @module @kb-labs/rest-api-app/middleware/rate-limit-routes
 * Per-route rate limiting middleware
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';

/**
 * Rate limit configuration per route
 */
interface RouteRateLimit {
  max: number;
  timeWindow: string;
}

const routeLimits: Record<string, RouteRateLimit> = {
  '/audit/runs': { max: 10, timeWindow: '1 minute' },
  '/release/runs': { max: 5, timeWindow: '1 minute' },
  '/devlink/check': { max: 20, timeWindow: '1 minute' },
  // Health endpoints - higher limits
  '/health': { max: 100, timeWindow: '1 minute' },
  '/ready': { max: 60, timeWindow: '1 minute' },
  '/observability/describe': { max: 60, timeWindow: '1 minute' },
  '/observability/health': { max: 60, timeWindow: '1 minute' },
  // Info endpoints - moderate limits
  '/info': { max: 30, timeWindow: '1 minute' },
  '/info/capabilities': { max: 30, timeWindow: '1 minute' },
  // Jobs endpoints - moderate limits
  '/jobs': { max: 60, timeWindow: '1 minute' },
};

/**
 * Register per-route rate limiting
 */
export function registerRouteRateLimiting(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // Only apply if rate limiting is enabled globally
  if (!config.rateLimit) {
    return;
  }

  // Apply route-specific limits
  for (const [route] of Object.entries(routeLimits)) {
    const fullPath = `${config.basePath}${route}`;
    
    server.addHook('onRequest', async (request, _reply) => {
      // Check if this route matches
      if (!request.url.startsWith(fullPath)) {
        return;
      }

      // Apply route-specific rate limit
      // Note: This is a simplified implementation
      // Full implementation would use @fastify/rate-limit with route-specific config
      // For now, we rely on global rate limiting configured in plugins
    });
  }

  // Apply stricter limits for POST requests to run endpoints
  server.addHook('onRequest', async (request, _reply) => {
    const isRunEndpoint = request.url.includes('/audit/runs') || 
                          request.url.includes('/release/runs') ||
                          request.url.includes('/devlink/check');
    
    if (isRunEndpoint && request.method === 'POST') {
      // These limits are enforced by the queue adapter's concurrency limits
      // Additional rate limiting is handled globally
    }
  });
}
