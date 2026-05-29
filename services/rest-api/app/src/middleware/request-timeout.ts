/**
 * @module @kb-labs/rest-api-app/middleware/request-timeout
 * Enforce route-level request timeouts
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { metricsCollector } from './metrics';

type RouteConfig = {
  kbRouteBudgetMs?: number | null;
};

export function registerRequestTimeoutGuard(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  const defaultTimeout = config.timeouts?.requestTimeout ?? 30_000;

  server.addHook('onRequest', (request, reply, done) => {
    const routeConfig = (request.routeOptions?.config || {}) as RouteConfig;
    let budget = typeof routeConfig.kbRouteBudgetMs === 'number' && routeConfig.kbRouteBudgetMs > 0
      ? routeConfig.kbRouteBudgetMs
      : null;

    if (!budget) {
      const normalized =
        request.routeOptions?.url ??
        request.url;
      const inferred = normalized ? metricsCollector.getRouteBudget(request.method, normalized) : null;
      if (inferred && inferred > 0) {
        budget = inferred;
      }
    }

    if (!budget || budget <= 0) {
      budget = defaultTimeout;
    }

    if (!budget || budget <= 0) {
      done();
      return;
    }

    reply.raw.setTimeout(budget, () => {
      if (reply.sent) {
        return;
      }
      reply
        .code(504)
        .header('Content-Type', 'application/json')
        .send({
          schema: 'kb.errors/timeout/1',
          status: 'error',
          http: 504,
          code: 'E_GATEWAY_TIMEOUT',
          message: 'Request timed out',
          meta: {
            method: request.method,
            route: request.routeOptions?.url ?? request.url,
            timeoutMs: budget,
          },
        });
    });

    done();
  });
}

