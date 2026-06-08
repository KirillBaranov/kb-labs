import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ILogger } from '@kb-labs/core-platform';
import type { ServiceObservabilityDescribe, ServiceObservabilityHealth } from '@kb-labs/core-contracts';
import { createCorrelatedLogger } from './log-correlation.js';
import { registerOpenAPI, type OpenAPIOptions } from './register-openapi.js';
import type { ServiceReadyResponse } from './service-observability.js';

export interface ObservabilityCollectorLike {
  register(server: FastifyInstance): void;
  buildDescribe(): ServiceObservabilityDescribe;
  buildHealth(params?: Record<string, unknown>): ServiceObservabilityHealth;
  renderPrometheusMetrics(status: string, extra?: string[]): string;
}

export interface DaemonServerOptions {
  serviceId: string;
  logger: ILogger;
  observability: ObservabilityCollectorLike;
  bodyLimit?: number;
  trustProxy?: boolean;
  /** Optional CORS config — requires @fastify/cors peer dep */
  cors?: Record<string, unknown>;
  openapi?: Pick<OpenAPIOptions, 'title' | 'description'>;
  setErrorHandler?: (server: FastifyInstance) => void;
  registerRoutes?: (server: FastifyInstance) => Promise<void>;
  /** Called AFTER correlation hook — request.kbLogger is already set */
  onRequest?: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /**
   * When true, skip registering the 5 standard observability routes
   * (/health, /ready, /metrics, /observability/describe, /observability/health).
   * Use when the service needs fully custom implementations of these routes.
   */
  skipStandardRoutes?: boolean;
  /**
   * Optional custom readiness check. When provided, /ready returns 200 if the
   * check passes and 503 otherwise. When omitted, /ready delegates to buildHealth().
   */
  readyCheck?: () => ServiceReadyResponse | { ready: boolean; [key: string]: unknown };
}

export async function createDaemonServer(opts: DaemonServerOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
    bodyLimit: opts.bodyLimit ?? 10_485_760,
    trustProxy: opts.trustProxy ?? false,
  });

  opts.observability.register(server);

  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const traceId = (request.headers['x-trace-id'] as string | undefined) ?? randomUUID();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);
    reply.header('X-Trace-Id', traceId);

    request.kbLogger = createCorrelatedLogger(opts.logger, {
      serviceId: opts.serviceId,
      logsSource: opts.serviceId,
      layer: opts.serviceId,
      service: 'request',
      requestId,
      traceId,
      method: request.method,
      url: request.url,
      operation: 'http.request',
    });

    request.kbLogger.info(`→ ${request.method.toUpperCase()} ${request.url}`);

    await opts.onRequest?.(request, reply);
  });

  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    request.kbLogger?.info(`✓ ${request.method.toUpperCase()} ${request.url} ${reply.statusCode}`, {
      statusCode: reply.statusCode,
    });
  });

  if (!opts.skipStandardRoutes) {
  server.get('/health', async () => opts.observability.buildHealth());
  server.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (opts.readyCheck) {
      const result = opts.readyCheck();
      return reply.code(result.ready ? 200 : 503).send(result);
    }
    return opts.observability.buildHealth();
  });
  server.get('/metrics', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return opts.observability.renderPrometheusMetrics('healthy');
  });
  server.get('/observability/describe', async () => opts.observability.buildDescribe());
  server.get('/observability/health', async () => opts.observability.buildHealth());
  } // end if (!opts.skipStandardRoutes)

  if (opts.cors) {
    const { default: fastifyCors } = await import('@fastify/cors');
    await server.register(fastifyCors, opts.cors as Parameters<typeof fastifyCors>[1]);
  }

  if (opts.openapi) {
    await registerOpenAPI(server, {
      title: opts.openapi.title,
      description: opts.openapi.description,
      version: '1.0.0',
    });
  }

  opts.setErrorHandler?.(server);

  await opts.registerRoutes?.(server);

  return server;
}
