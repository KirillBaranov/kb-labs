/**
 * @module @kb-labs/rest-api-app/middleware
 * Middleware registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { platform } from '@kb-labs/core-runtime';
import { registerEnvelopeMiddleware } from './envelope';
import { registerRequestIdMiddleware } from './request-id';
import { registerMockModeMiddleware } from './mock-mode';
import { registerSecurityHeadersMiddleware } from './security-headers';
import { registerCacheMiddleware } from './cache';
import { registerMetricsMiddleware } from './metrics';
import { registerProcessErrorGuard } from './process-error-guard';
import { registerStartupThrottle } from './startup-throttle';
import { registerRequestTimeoutGuard } from './request-timeout';
import { registerTenantRateLimitMiddleware } from './tenant-rate-limit';

/**
 * Middleware chain — порядок регистрации = порядок выполнения
 * (onRequest: top→bottom, onSend: bottom→top)
 *
 *  #   File                     Adds to request
 * ─── ──────────────────────── ─────────────────────────────────────────
 *  1  startup-throttle          kbStartupGuardActive, kbStartupGuardTimer
 *  2  security-headers          (only reply headers)
 *  3  request-id                request.id, kbLogger
 *  4  tenant-rate-limit         tenantId
 *  5  mock-mode                 (short-circuits to mock response)
 *  6  request-timeout           (reads kbLogger)
 *  7  metrics                   kbMetricsStart
 *  8  envelope                  (wraps errors; must run before cache)
 *  9  cache                     (reads ETag; may return 304)
 * ──  process-error-guard       NOT a request hook — process.on handlers
 */
export function registerMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  registerStartupThrottle(server, config);
  registerSecurityHeadersMiddleware(server);
  registerRequestIdMiddleware(server);
  registerTenantRateLimitMiddleware(server, platform.cache);
  registerMockModeMiddleware(server, config);
  registerRequestTimeoutGuard(server, config);
  registerMetricsMiddleware(server);
  // Envelope runs before cache: ETag is computed on the final wrapped payload
  registerEnvelopeMiddleware(server, config);
  registerCacheMiddleware(server);
  // Process-level guard (uncaughtException / unhandledRejection) — not a request hook
  registerProcessErrorGuard(server);
}
