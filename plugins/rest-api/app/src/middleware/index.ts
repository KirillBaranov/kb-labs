/**
 * @module @kb-labs/rest-api-app/middleware
 * Middleware registration
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerEnvelopeMiddleware } from './envelope';
import { registerRequestIdMiddleware } from './request-id';
import { registerMockModeMiddleware } from './mock-mode';
import { registerSecurityHeadersMiddleware } from './security-headers';
import { registerCacheMiddleware } from './cache';
import { registerMetricsMiddleware } from './metrics';
import { registerErrorGuard } from './error-guard';
import { registerStartupGuard } from './startup-guard';
import { registerRequestTimeoutGuard } from './request-timeout';

/**
 * Register all middleware
 */
export function registerMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  registerStartupGuard(server, config);
  registerSecurityHeadersMiddleware(server);
  registerRequestIdMiddleware(server);
  registerMockModeMiddleware(server, config);
  registerCacheMiddleware(server);
  registerRequestTimeoutGuard(server, config);
  registerMetricsMiddleware(server);
  registerEnvelopeMiddleware(server, config);

  // Global error guard for plugin routes (must be last)
  registerErrorGuard(server);
}

