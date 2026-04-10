import Fastify, { type FastifyInstance } from 'fastify';
import { InMemoryStateBroker } from '@kb-labs/core-state-broker';
import type { ILogger } from '@kb-labs/core-platform';
import {
  createCorrelatedLogger,
  HttpObservabilityCollector,
  createServiceReadyResponse,
  metricLine,
  registerOpenAPI,
} from '@kb-labs/shared-http';
import type { ObservabilityCheck, ServiceHealthStatus } from '@kb-labs/core-contracts';
import { randomUUID } from 'node:crypto';

export interface StateDaemonConfig {
  port?: number;
  host?: string;
  logger?: ILogger;
}

function createFallbackLogger(): ILogger {
  const bindings: Record<string, unknown> = {};

  const formatMeta = (meta?: Record<string, unknown>) => {
    const combined = { ...bindings, ...(meta ?? {}) };
    return Object.keys(combined).length > 0 ? ` ${JSON.stringify(combined)}` : '';
  };

  return {
    info(message: string, meta?: Record<string, unknown>) {
      console.log(`[INFO] ${message}${formatMeta(meta)}`);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(`[WARN] ${message}${formatMeta(meta)}`);
    },
    error(message: string, error?: Error, meta?: Record<string, unknown>) {
      const merged = error
        ? { ...(meta ?? {}), error: { message: error.message, stack: error.stack } }
        : meta;
      console.error(`[ERROR] ${message}${formatMeta(merged)}`);
    },
    fatal(message: string, error?: Error, meta?: Record<string, unknown>) {
      const merged = error
        ? { ...(meta ?? {}), error: { message: error.message, stack: error.stack } }
        : meta;
      console.error(`[FATAL] ${message}${formatMeta(merged)}`);
    },
    debug(message: string, meta?: Record<string, unknown>) {
      console.debug(`[DEBUG] ${message}${formatMeta(meta)}`);
    },
    trace(message: string, meta?: Record<string, unknown>) {
      console.debug(`[TRACE] ${message}${formatMeta(meta)}`);
    },
    child(childBindings: Record<string, unknown>) {
      const childLogger = createFallbackLogger();
      return {
        ...childLogger,
        info(message: string, meta?: Record<string, unknown>) {
          console.log(`[INFO] ${message}${formatMeta({ ...childBindings, ...(meta ?? {}) })}`);
        },
        warn(message: string, meta?: Record<string, unknown>) {
          console.warn(`[WARN] ${message}${formatMeta({ ...childBindings, ...(meta ?? {}) })}`);
        },
        error(message: string, error?: Error, meta?: Record<string, unknown>) {
          const merged = error
            ? { ...childBindings, ...(meta ?? {}), error: { message: error.message, stack: error.stack } }
            : { ...childBindings, ...(meta ?? {}) };
          console.error(`[ERROR] ${message}${formatMeta(merged)}`);
        },
        fatal(message: string, error?: Error, meta?: Record<string, unknown>) {
          const merged = error
            ? { ...childBindings, ...(meta ?? {}), error: { message: error.message, stack: error.stack } }
            : { ...childBindings, ...(meta ?? {}) };
          console.error(`[FATAL] ${message}${formatMeta(merged)}`);
        },
        debug(message: string, meta?: Record<string, unknown>) {
          console.debug(`[DEBUG] ${message}${formatMeta({ ...childBindings, ...(meta ?? {}) })}`);
        },
        trace(message: string, meta?: Record<string, unknown>) {
          console.debug(`[TRACE] ${message}${formatMeta({ ...childBindings, ...(meta ?? {}) })}`);
        },
      };
    },
  };
}

export class StateDaemonServer {
  private readonly broker = new InMemoryStateBroker();
  private readonly observability = new HttpObservabilityCollector({
    serviceId: 'state-daemon',
    serviceType: 'state-daemon',
    version: '1.2.0',
    logsSource: 'state-daemon',
  });
  private readonly logger: ILogger;
  private server: FastifyInstance | null = null;
  private isShuttingDown = false;

  constructor(private readonly config: StateDaemonConfig = {}) {
    this.logger = config.logger ?? createFallbackLogger();
  }

  async start(): Promise<void> {
    const port = this.config.port ?? 7777;
    const host = this.config.host ?? 'localhost';

    const server = Fastify({
      logger: false,
      bodyLimit: 1048576,
    });

    server.addHook('onRequest', async (request, reply) => {
      const requestId = (request.headers['x-request-id'] as string | undefined) || randomUUID();
      const traceId = (request.headers['x-trace-id'] as string | undefined) || randomUUID();

      request.id = requestId;
      reply.header('X-Request-Id', requestId);
      reply.header('X-Trace-Id', traceId);

      (request as any).kbLogger = createCorrelatedLogger(this.logger, {
        serviceId: 'state-daemon',
        logsSource: 'state-daemon',
        layer: 'state-daemon',
        service: 'request',
        requestId,
        traceId,
        method: request.method,
        url: request.url,
        operation: 'http.request',
      });
      (request as any).kbLogger.info(`→ ${request.method.toUpperCase()} ${request.url}`);

      if (request.method === 'OPTIONS') {
        reply.code(204).send();
      }
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
    server.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, PUT, DELETE, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      return payload;
    });

    await registerOpenAPI(server, {
      title: 'KB Labs State Daemon',
      description: 'State broker service for persistent cross-invocation state',
      version: '1.2.0',
      servers: [{ url: `http://${host}:${port}`, description: 'Local dev' }],
      ui: false,
    });

    this.observability.register(server);
    this.registerRoutes(server);
    this.observability.recordOperation('state.bootstrap', 0, 'ok');
    this.server = server;

    process.on('SIGTERM', () => void this.shutdown());
    process.on('SIGINT', () => void this.shutdown());

    await server.listen({ port, host });
  }

  async stop(): Promise<void> {
    await this.broker.stop();
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    this.logger.info('Shutting down state daemon...');
    await this.stop();
    process.exit(0);
  }

  private getBrokerHealth() {
    return this.observability.observeOperation('state.health', () => this.broker.getHealth());
  }

  private getBrokerStats() {
    return this.observability.observeOperation('state.stats', () => this.broker.getStats());
  }

  private registerRoutes(server: FastifyInstance): void {
    server.get('/health', async () => this.getBrokerHealth());

    server.get('/ready', async () => {
      const health = await this.getBrokerHealth();
      const degraded = health.status !== 'ok';
      return createServiceReadyResponse({
        ready: health.status === 'ok',
        status: degraded ? 'degraded' : 'ready',
        reason: degraded ? `state_broker_${health.status}` : 'ready',
        components: {
          stateBroker: {
            ready: health.status === 'ok',
            status: health.status,
          },
        },
      });
    });

    server.get('/stats', async () => this.getBrokerStats());

    server.get('/metrics', async (_request, reply) => {
      const health = await this.getBrokerHealth();
      const stats = await this.getBrokerStats();
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return this.observability.renderPrometheusMetrics(
        mapBrokerHealthStatus(health.status),
        buildBrokerMetricLines(stats),
      );
    });

    server.get('/observability/describe', async () => this.observability.buildDescribe());

    server.get('/observability/health', async () => {
      const health = await this.getBrokerHealth();
      const stats = await this.getBrokerStats();

      return this.observability.buildHealth({
        status: mapBrokerHealthStatus(health.status),
        checks: buildBrokerChecks(health),
        meta: {
          serviceHealthEndpoint: '/health',
          statsEndpoint: '/stats',
          totalEntries: stats.totalEntries,
          totalSize: stats.totalSize,
          hitRate: stats.hitRate,
          missRate: stats.missRate,
          evictions: stats.evictions,
        },
      });
    });

    server.get('/state/:key', async (request, reply) => {
      const { key } = request.params as { key: string };
      const value = await this.observability.observeOperation('state.get', () => this.broker.get(key));

      if (value === null) {
        reply.code(404);
        return null;
      }

      reply.type('application/json');
      return JSON.stringify(value);
    });

    server.put('/state/:key', async (request, reply) => {
      const { key } = request.params as { key: string };
      const { value, ttl } = request.body as { value: unknown; ttl?: number };
      await this.observability.observeOperation('state.set', () => this.broker.set(key, value, ttl));
      reply.code(204);
      return null;
    });

    server.delete('/state/:key', async (request, reply) => {
      const { key } = request.params as { key: string };
      await this.observability.observeOperation('state.delete', () => this.broker.delete(key));
      reply.code(204);
      return null;
    });

    server.post('/state/clear', async (request, reply) => {
      const pattern = (request.query as { pattern?: string }).pattern;
      await this.observability.observeOperation('state.clear', () => this.broker.clear(pattern));
      reply.code(204);
      return null;
    });
  }
}

function mapBrokerHealthStatus(status: 'ok' | 'degraded' | 'shutting_down'): ServiceHealthStatus {
  if (status === 'ok') {
    return 'healthy';
  }
  if (status === 'degraded') {
    return 'degraded';
  }
  return 'unhealthy';
}

function buildBrokerChecks(health: Awaited<ReturnType<InMemoryStateBroker['getHealth']>>): ObservabilityCheck[] {
  return [
    {
      id: 'state-broker',
      status: health.status === 'ok' ? 'ok' : health.status === 'degraded' ? 'warn' : 'error',
      message: `Broker status is ${health.status}`,
    },
  ];
}

function buildBrokerMetricLines(stats: Awaited<ReturnType<InMemoryStateBroker['getStats']>>): string[] {
  return [
    '# HELP state_broker_entries_total Total entries stored by the state broker',
    '# TYPE state_broker_entries_total gauge',
    metricLine('state_broker_entries_total', stats.totalEntries),
    '# HELP state_broker_size_bytes Estimated total size of state broker entries',
    '# TYPE state_broker_size_bytes gauge',
    metricLine('state_broker_size_bytes', stats.totalSize),
    '# HELP state_broker_evictions_total Number of evicted state broker entries',
    '# TYPE state_broker_evictions_total gauge',
    metricLine('state_broker_evictions_total', stats.evictions),
  ];
}
