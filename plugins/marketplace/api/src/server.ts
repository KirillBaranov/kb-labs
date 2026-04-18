/**
 * @module @kb-labs/marketplace-api/server
 * Fastify server factory for marketplace service.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import {
  createCorrelatedLogger,
  HttpObservabilityCollector,
  createServiceReadyResponse,
  registerOpenAPI,
} from '@kb-labs/shared-http';
import type { ILogger } from '@kb-labs/core-platform';
import { registerRoutes } from './routes/index.js';
import type { MarketplaceService } from '@kb-labs/marketplace-core';
import { ScopeResolutionError, AdapterScopeError } from '@kb-labs/marketplace-core';
import { PackageInstallError } from '@kb-labs/marketplace-npm';
import { ScopeRequestError } from './scope-parser.js';
import { randomUUID } from 'node:crypto';

const DEFAULT_PORT = 5070;

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

export interface CreateServerOptions {
  service: MarketplaceService;
  logger?: ILogger;
  port?: number;
  host?: string;
}

export async function createServer(opts: CreateServerOptions): Promise<FastifyInstance> {
  const port = opts.port ?? DEFAULT_PORT;
  const logger = opts.logger ?? createFallbackLogger();
  const observability = new HttpObservabilityCollector({
    serviceId: 'marketplace',
    serviceType: 'http-api',
    version: '0.1.0',
    logsSource: 'marketplace',
  });
  const server = Fastify({
    logger: false, // using platform.logger
  });

  // OpenAPI docs
  await registerOpenAPI(server, {
    title: 'KB Labs Marketplace',
    version: '0.1.0',
    description: 'Unified marketplace for plugins, adapters, workflows, and more',
    servers: [
      { url: `http://localhost:${port}`, description: 'Local dev' },
    ],
    ui: process.env.NODE_ENV !== 'production',
  });

  // Decorate with service instance
  server.decorate('marketplace', opts.service);
  server.decorate('observability', observability);
  observability.register(server);

  // Scope-related errors → 400. All three share a `code` property so clients
  // can discriminate (SCOPE_INVALID, SCOPE_PROJECT_ROOT_REQUIRED,
  // SCOPE_PROJECT_EQUALS_PLATFORM, MARKETPLACE_ADAPTER_PROJECT_SCOPE, ...).
  server.setErrorHandler((err, _request, reply) => {
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

  server.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) || randomUUID();
    const traceId = (request.headers['x-trace-id'] as string | undefined) || randomUUID();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);
    reply.header('X-Trace-Id', traceId);

    (request as any).kbLogger = createCorrelatedLogger(logger, {
      serviceId: 'marketplace',
      logsSource: 'marketplace',
      layer: 'marketplace',
      service: 'request',
      requestId,
      traceId,
      method: request.method,
      url: request.url,
      operation: 'http.request',
    });
    (request as any).kbLogger.info(`→ ${request.method.toUpperCase()} ${request.url}`);
  });

  server.addHook('onResponse', async (request, reply) => {
    const logger = (request as any).kbLogger as { info: (message: string, meta?: Record<string, unknown>) => void } | undefined;
    if (!logger) {
      return;
    }

    logger.info(`✓ ${request.method.toUpperCase()} ${request.url} ${reply.statusCode}`, {
      statusCode: reply.statusCode,
    });
  });

  server.get('/health', async () => ({
    status: 'ok',
    service: 'marketplace',
    ts: Date.now(),
  }));

  server.get('/ready', async () =>
    createServiceReadyResponse({
      ready: true,
      components: {
        marketplaceService: {
          ready: true,
        },
      },
    })
  );

  server.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return observability.renderPrometheusMetrics('healthy');
  });

  server.get('/observability/describe', async () => observability.buildDescribe());

  server.get('/observability/health', async () =>
    observability.buildHealth({
      status: 'healthy',
      checks: [
        {
          id: 'marketplace-service',
          status: 'ok',
          message: 'Marketplace service registered',
        },
      ],
      meta: {
        serviceHealthEndpoint: '/health',
      },
    })
  );

  // Register routes
  await observability.observeOperation('marketplace.bootstrap', () => registerRoutes(server));

  return server;
}
