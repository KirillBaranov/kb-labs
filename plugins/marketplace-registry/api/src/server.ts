import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import multipart from '@fastify/multipart';
import {
  createCorrelatedLogger,
  HttpObservabilityCollector,
  createServiceReadyResponse,
  registerOpenAPI,
} from '@kb-labs/shared-http';
import type { ILogger } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import type { RegistryService } from '@kb-labs/marketplace-registry-core';
import { registerPackageRoutes } from './routes/packages.js';
import { createRegistryAuthMiddleware } from './auth-middleware.js';
import { randomUUID } from 'node:crypto';

const DEFAULT_PORT = 5071;

export interface RegistryServerOptions {
  port?: number;
  host?: string;
  logger: ILogger;
  registry: RegistryService;
  jwtConfig?: JwtConfig;
}

export async function createRegistryServer(opts: RegistryServerOptions): Promise<FastifyInstance> {
  const { port = DEFAULT_PORT, host = '0.0.0.0', logger, registry, jwtConfig } = opts;

  const observability = new HttpObservabilityCollector({
    serviceId: 'marketplace-registry',
    serviceType: 'http-api',
    version: '0.1.0',
    logsSource: 'marketplace-registry',
  });

  const app = Fastify({ logger: false });

  await app.register(multipart, { limits: { fileSize: 55 * 1024 * 1024 } });

  await registerOpenAPI(app, {
    title: 'KB Labs Marketplace Registry',
    version: '0.1.0',
    description: 'Public registry for KB Labs plugins and adapters',
    servers: [
      { url: `http://localhost:${port}`, description: 'Local dev' },
    ],
    ui: process.env.NODE_ENV !== 'production',
  });

  app.decorate('registry', registry);
  app.decorate('observability', observability);
  observability.register(app);

  if (jwtConfig) {
    app.addHook('onRequest', createRegistryAuthMiddleware(jwtConfig));
  }

  app.setErrorHandler((err: FastifyError, request, reply) => {
    const code: string = (err as FastifyError & { code?: string }).code ?? 'UNKNOWN';

    if (code === 'PACKAGE_NOT_FOUND' || code === 'VERSION_NOT_FOUND') {
      return reply.code(404).send({ error: 'NotFound', code, message: err.message });
    }
    if (code === 'VERSION_ALREADY_EXISTS') {
      return reply.code(409).send({ error: 'Conflict', code, message: err.message });
    }
    if (code === 'TARBALL_TOO_LARGE' || code === 'INVALID_MANIFEST') {
      return reply.code(422).send({ error: 'UnprocessableEntity', code, message: err.message });
    }
    if (code === 'FORBIDDEN' || code === 'VERSION_YANKED') {
      return reply.code(403).send({ error: 'Forbidden', code, message: err.message });
    }
    if (err.statusCode === 401) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED', message: err.message });
    }
    // Unhandled error — log full stack so failures surface in service logs.
    logger.error('Unhandled registry error', err, {
      route: `${request.method} ${request.url}`,
      code,
    });
    return reply.code(500).send({ error: 'InternalServerError', code, message: err.message });
  });

  app.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const traceId = (request.headers['x-trace-id'] as string | undefined) ?? randomUUID();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);
    reply.header('X-Trace-Id', traceId);

    request.kbLogger = createCorrelatedLogger(logger, {
      serviceId: 'marketplace-registry',
      logsSource: 'marketplace-registry',
      layer: 'marketplace-registry',
      service: 'request',
      requestId,
      traceId,
      method: request.method,
      url: request.url,
      operation: 'http.request',
    });
    request.kbLogger.info(`→ ${request.method.toUpperCase()} ${request.url}`);
  });

  app.addHook('onResponse', async (request, reply) => {
    request.kbLogger?.info(`✓ ${request.method.toUpperCase()} ${request.url} ${reply.statusCode}`, {
      statusCode: reply.statusCode,
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'marketplace-registry',
    ts: Date.now(),
  }));

  app.get('/ready', async () =>
    createServiceReadyResponse({
      ready: true,
      components: { registryService: { ready: true } },
    })
  );

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return observability.renderPrometheusMetrics('healthy');
  });

  app.get('/observability/describe', async () => observability.buildDescribe());

  app.get('/observability/health', async () =>
    observability.buildHealth({
      status: 'healthy',
      checks: [{ id: 'registry-service', status: 'ok', message: 'Registry service registered' }],
      meta: { serviceHealthEndpoint: '/health' },
    })
  );

  await observability.observeOperation('marketplace-registry.bootstrap', () =>
    registerPackageRoutes(app, registry),
  );

  return app;
}
