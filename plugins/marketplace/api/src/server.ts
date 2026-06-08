/**
 * @module @kb-labs/marketplace-api/server
 * Fastify server factory for marketplace service.
 */

import { type FastifyInstance } from 'fastify';
import {
  HttpObservabilityCollector,
  createDaemonServer,
  createServiceReadyResponse,
  type ObservabilityCollectorLike,
} from '@kb-labs/shared-http';
import type { ILogger } from '@kb-labs/core-platform';
import type { ServiceHealthStatus, ObservabilityCheckStatus } from '@kb-labs/core-contracts';
import { registerRoutes } from './routes/index.js';
import type { MarketplaceService } from '@kb-labs/marketplace-core';
import { ScopeResolutionError, AdapterScopeError, InvalidEntityError } from '@kb-labs/marketplace-core';
import { PackageInstallError } from '@kb-labs/marketplace-npm';
import { ScopeRequestError } from './scope-parser.js';

export interface CreateServerOptions {
  service: MarketplaceService;
  logger?: ILogger;
  port?: number;
  host?: string;
}

function createFallbackLogger(): ILogger {
  const child = (_bindings: Record<string, unknown>): ILogger => createFallbackLogger();
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child,
  };
}

/**
 * Wraps HttpObservabilityCollector to satisfy ObservabilityCollectorLike.
 * The buildHealth() no-arg call from createDaemonServer routes uses a fixed
 * "service registered" check — the same information the original routes conveyed.
 */
function wrapObservability(collector: HttpObservabilityCollector): ObservabilityCollectorLike {
  return {
    register: (server: FastifyInstance) => collector.register(server),
    buildDescribe: () => collector.buildDescribe(),
    renderPrometheusMetrics: (status: string, extra?: string[]) => collector.renderPrometheusMetrics(status as ServiceHealthStatus, extra),
    buildHealth: (_params?: Record<string, unknown>) =>
      collector.buildHealth({
        status: 'healthy' as ServiceHealthStatus,
        checks: [{ id: 'marketplace-service', status: 'ok' as ObservabilityCheckStatus, message: 'Marketplace service registered' }],
        meta: { serviceHealthEndpoint: '/health' },
      }),
  };
}

export async function createServer(opts: CreateServerOptions): Promise<FastifyInstance> {
  const logger = opts.logger ?? createFallbackLogger();

  const collector = new HttpObservabilityCollector({
    serviceId: 'marketplace',
    serviceType: 'http-api',
    version: '0.1.0',
    logsSource: 'marketplace',
  });
  const observability = wrapObservability(collector);

  const server = await createDaemonServer({
    serviceId: 'marketplace',
    logger,
    observability,
    // /ready must return { ready, components } (createServiceReadyResponse shape),
    // not the bare buildHealth() payload — e2e MH-03/MH-04 assert body.ready and
    // body.components.marketplaceService.
    readyCheck: () =>
      createServiceReadyResponse({
        ready: true,
        components: { marketplaceService: { ready: true } },
      }),
    openapi: {
      title: 'KB Labs Marketplace',
      description: 'Unified marketplace for plugins, adapters, workflows, and more',
    },
    setErrorHandler: (app) => {
      // Scope-related errors → 400. All three share a `code` property so clients
      // can discriminate (SCOPE_INVALID, SCOPE_PROJECT_ROOT_REQUIRED,
      // SCOPE_PROJECT_EQUALS_PLATFORM, MARKETPLACE_ADAPTER_PROJECT_SCOPE, ...).
      app.setErrorHandler((err, _request, reply) => {
        if (
          err instanceof ScopeRequestError ||
          err instanceof ScopeResolutionError ||
          err instanceof AdapterScopeError
        ) {
          return reply.code(400).send({
            error: err.name,
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof InvalidEntityError) {
          return reply.code(422).send({
            error: err.name,
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof PackageInstallError) {
          const status = err.code === 'NOT_FOUND' ? 404 : 422;
          return reply.code(status).send({
            error: err.name,
            code: err.code,
            message: err.message,
          });
        }
        // Fallback to Fastify default behaviour.
        throw err;
      });
    },
    registerRoutes: async (app) => {
      // Decorate with service and observability instances before registering routes.
      app.decorate('marketplace', opts.service);
      app.decorate('observability', collector);

      await collector.observeOperation('marketplace.bootstrap', () => registerRoutes(app));
    },
  });

  return server;
}
