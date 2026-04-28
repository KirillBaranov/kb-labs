import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHttpProxy from '@fastify/http-proxy';
import { platform } from '@kb-labs/core-runtime';
import {
  createCorrelatedLogger,
  createServiceReadyResponse,
  registerOpenAPI,
} from '@kb-labs/shared-http';
import { logDiagnosticEvent, type ICache, type ILogger } from '@kb-labs/core-platform';
import type { GatewayConfig } from '@kb-labs/gateway-contracts';
import { HostRegistrationSchema } from '@kb-labs/gateway-contracts';
import { AuthService, type JwtConfig } from '@kb-labs/gateway-auth';
import { createAuthMiddleware } from './auth/middleware.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerExecuteRoutes } from './execute/routes.js';
import { registerLLMGatewayRoutes } from './llm/routes.js';
import { registerTelemetryRoutes } from './telemetry/routes.js';
import { registerPlatformRoutes } from './platform/routes.js';
import { registerAggregatedDocsRoutes } from './docs/routes.js';
import { HostRegistry } from './hosts/registry.js';
import { globalDispatcher } from './hosts/dispatcher.js';
import { attachGatewayWs } from './ws/gateway-ws.js';
import { GatewayObservabilityCollector } from './observability/collector.js';
import { randomUUID } from 'node:crypto';

/** Strip bearer tokens from query params before logging (prevents JWT leakage in access logs). */
function redactQueryToken(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/gi, '$1[REDACTED]');
}

export async function createServer(
  config: GatewayConfig,
  cache: ICache,
  logger: ILogger,
  jwtConfig: JwtConfig,
  registry?: HostRegistry,
) {
  const gatewayLogger = createCorrelatedLogger(logger, {
    serviceId: 'gateway',
    logsSource: 'gateway',
    layer: 'gateway',
    service: 'server',
    operation: 'gateway.http',
  });
  const app = Fastify({
    logger: false,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // OpenAPI / Swagger UI — must be registered before routes
  await registerOpenAPI(app, {
    title: 'KB Labs Gateway',
    description: 'Central API gateway — auth, LLM, telemetry, platform dispatch',
    version: '1.0.0',
    servers: [{ url: 'http://localhost:4000', description: 'Local dev' }],
    ui: !isProduction,
  });

  // origin: true reflects the request Origin — required for browser clients (Studio, E2E).
  // Restricting to an explicit allowlist is a future hardening step once origins are stable.
  await app.register(fastifyCors, { origin: true });
  const observability = new GatewayObservabilityCollector(config);
  observability.register(app);
  app.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) || request.id || randomUUID();
    const traceId = (request.headers['x-trace-id'] as string | undefined) || randomUUID();

    request.id = requestId;
    reply.header('X-Request-Id', requestId);
    reply.header('X-Trace-Id', traceId);

    const safeUrl = redactQueryToken(request.url);
    request.kbLogger = createCorrelatedLogger(logger, {
      serviceId: 'gateway',
      logsSource: 'gateway',
      layer: 'gateway',
      service: 'request',
      requestId,
      traceId,
      method: request.method,
      url: safeUrl,
      operation: 'http.request',
    });
    request.kbLogger.info(`→ ${request.method.toUpperCase()} ${safeUrl}`);
  });

  app.addHook('onResponse', async (request, reply) => {
    const requestLogger = request.kbLogger;
    if (!requestLogger) {
      return;
    }

    const safeUrl = redactQueryToken(request.url);
    requestLogger.info(`✓ ${request.method.toUpperCase()} ${safeUrl} ${reply.statusCode}`, {
      statusCode: reply.statusCode,
    });
  });

  // ── Proxy upstreams ────────────────────────────────────────────────
  // Registered FIRST, before any hooks. Auth is handled by upstreams themselves.
  // @fastify/http-proxy with websocket:true intercepts upgrades at the HTTP
  // server level — no Fastify hooks must touch these requests.
  // Gateway is a dumb proxy — real per-route timeout enforcement lives in REST API.
  // 1 hour hard ceiling; anything longer should be a background job.
  const PROXY_TIMEOUT_MS = 3_600_000;

  for (const [name, upstream] of Object.entries(config.upstreams)) {
    await app.register(fastifyHttpProxy, {
      upstream: upstream.url,
      prefix: upstream.prefix,
      rewritePrefix: upstream.rewritePrefix ?? upstream.prefix,
      disableCache: true,
      websocket: upstream.websocket ?? false,
      http: {
        requestOptions: {
          timeout: PROXY_TIMEOUT_MS,
        },
      },
    });
    gatewayLogger.info(`Upstream registered: ${name} → ${upstream.url} (${upstream.prefix}${upstream.websocket ? ', ws' : ''})`);
  }

  // ── Gateway's own routes (with auth) ───────────────────────────────
  // Encapsulated scope: auth hook only applies to gateway-owned routes,
  // not to proxy upstreams registered above.
  await app.register(async function gatewayRoutes(scope) {
    scope.addHook('onRequest', createAuthMiddleware(cache, jwtConfig));

    // Auth service + public routes (/auth/register, /auth/token, /auth/refresh)
    const authService = new AuthService(cache, jwtConfig);
    registerAuthRoutes(scope as unknown as Parameters<typeof registerAuthRoutes>[0], authService);

    // Health (public) — comprehensive adapter + upstream health
    const HEALTH_CACHE_KEY = '__gateway_health';
    const HEALTH_CACHE_TTL = 15_000; // 15s cache to prevent health DDoS
    const startupTime = Date.now();

    const collectHealthSnapshot = async () => {
      const cached = await cache.get<Record<string, unknown>>(HEALTH_CACHE_KEY).catch(() => null);
      if (cached) {
        return cached;
      }

      const adapterNames = ['llm', 'cache', 'analytics', 'vectorStore', 'embeddings'] as const;
      const adapters: Record<string, { available: boolean; latencyMs?: number }> = {};

      for (const name of adapterNames) {
        await observability.observeOperation(`gateway.adapter.${name}`, async () => {
          const probeStart = Date.now();
          try {
            const adapter = platform.getAdapter(name);
            adapters[name] = { available: !!adapter, latencyMs: Date.now() - probeStart };
          } catch {
            adapters[name] = { available: false, latencyMs: Date.now() - probeStart };
          }
        });
      }

      const upstreams: Record<string, { status: string; latencyMs?: number }> = {};
      for (const [name, upstream] of Object.entries(config.upstreams)) {
        await observability.observeOperation(`gateway.upstream.${name}.health`, async () => {
          const probeStart = Date.now();
          try {
            const res = await fetch(`${upstream.url}/health`, {
              signal: AbortSignal.timeout(2000),
            });
            const latencyMs = Date.now() - probeStart;
            upstreams[name] = { status: res.ok ? 'up' : 'down', latencyMs };
            if (!res.ok) {
              logDiagnosticEvent(logger, {
                domain: 'service',
                event: 'gateway.upstream.health',
                level: 'warn',
                reasonCode: 'upstream_unavailable',
                message: 'Gateway upstream health probe failed',
                outcome: 'failed',
                serviceId: 'gateway',
                route: `${upstream.prefix}/health`,
                evidence: {
                  upstreamId: name,
                  upstreamUrl: upstream.url,
                  statusCode: res.status,
                  latencyMs,
                },
              });
            }
          } catch (error) {
            const latencyMs = Date.now() - probeStart;
            upstreams[name] = { status: 'down', latencyMs };
            logDiagnosticEvent(logger, {
              domain: 'service',
              event: 'gateway.upstream.health',
              level: 'warn',
              reasonCode: 'upstream_unavailable',
              message: 'Gateway upstream health probe failed',
              outcome: 'failed',
              error: error instanceof Error ? error : new Error(String(error)),
              serviceId: 'gateway',
              route: `${upstream.prefix}/health`,
              evidence: {
                upstreamId: name,
                upstreamUrl: upstream.url,
                latencyMs,
              },
            });
          }
        });
      }

      const llmOk = adapters.llm?.available ?? false;
      const allOk = Object.values(adapters).every((a) => a.available);
      const snapshot = {
        status: llmOk ? (allOk ? 'healthy' : 'degraded') : 'unhealthy',
        version: '1.0',
        uptime: Math.floor((Date.now() - startupTime) / 1000),
        timestamp: new Date().toISOString(),
        adapters,
        upstreams,
      };

      await cache.set(HEALTH_CACHE_KEY, snapshot, HEALTH_CACHE_TTL).catch(() => {});
      return snapshot;
    };

    scope.get('/health', { schema: { tags: ['System'], summary: 'Gateway health check' } }, async () => {
      return collectHealthSnapshot();
    });

    scope.get('/ready', { schema: { tags: ['System'], summary: 'Gateway readiness check' } }, async (_request, reply) => {
      const health = await collectHealthSnapshot();
      const upstreams = (health.upstreams as Record<string, { status?: string }> | undefined) ?? {};
      const missingRequiredUpstreams = ['rest']
        .filter((id) => (upstreams[id]?.status ?? 'down') !== 'up');
      const ready = missingRequiredUpstreams.length === 0;

      return reply.code(ready ? 200 : 503).send(createServiceReadyResponse({
        ready,
        status: ready ? 'ready' : 'degraded',
        reason: ready ? 'ready' : `upstream_unavailable:${missingRequiredUpstreams.join(',')}`,
        components: {
          gatewayAdapters: {
            ready: true,
          },
          restUpstream: {
            ready: (upstreams.rest?.status ?? 'down') === 'up',
            status: upstreams.rest?.status ?? 'down',
          },
          workflowUpstream: {
            ready: (upstreams.workflow?.status ?? 'down') === 'up',
            status: upstreams.workflow?.status ?? 'down',
          },
          marketplaceUpstream: {
            ready: (upstreams.marketplace?.status ?? 'down') === 'up',
            status: upstreams.marketplace?.status ?? 'down',
          },
        },
      }));
    });

    scope.get('/metrics', { schema: { tags: ['Observability'], summary: 'Gateway metrics in Prometheus format' } }, async (_request, reply) => {
      const health = await collectHealthSnapshot();
      const status = (health.status as 'healthy' | 'degraded' | 'unhealthy' | undefined) ?? 'healthy';
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return observability.renderPrometheusMetrics(status);
    });

    scope.get('/observability/describe', {
      schema: { tags: ['Observability'], summary: 'Gateway observability contract descriptor' },
    }, async () => observability.buildDescribe());

    scope.get('/observability/health', {
      schema: { tags: ['Observability'], summary: 'Gateway observability health snapshot' },
    }, async () => {
      const health = await collectHealthSnapshot();
      const adapterChecks = Object.entries((health.adapters as Record<string, { available?: boolean; latencyMs?: number }> | undefined) ?? {})
        .map(([id, value]) => ({ id, available: !!value?.available, latencyMs: value?.latencyMs }));
      const upstreamChecks = Object.entries((health.upstreams as Record<string, { status?: string; latencyMs?: number }> | undefined) ?? {})
        .map(([id, value]) => ({ id, status: value?.status ?? 'unknown', latencyMs: value?.latencyMs }));
      const status = (health.status as 'healthy' | 'degraded' | 'unhealthy' | undefined) ?? 'healthy';
      return observability.buildHealth({ status, adapterChecks, upstreamChecks });
    });

    // Host registration (public)
    // Use injected registry (with persistence) or fallback to cache-only
    if (!registry) {
      gatewayLogger.warn('No persistent HostRegistry injected — hosts will be lost on restart');
    }
    const hostRegistry = registry ?? new HostRegistry(cache);
    scope.post('/hosts/register', { schema: { tags: ['Hosts'], summary: 'Register a host' } }, async (request, reply) => {
      const parsed = HostRegistrationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', issues: parsed.error.issues });
      }
      const result = await hostRegistry.register(parsed.data);
      return reply.code(201).send({
        hostId: result.descriptor.hostId,
        machineToken: result.machineToken,
        status: result.descriptor.status,
      });
    });

    // List hosts (auth required)
    scope.get('/hosts', { schema: { tags: ['Hosts'], summary: 'List registered hosts' } }, async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const hosts = await hostRegistry.list(auth.namespaceId);
      return { hosts };
    });

    // Get host by ID (auth required)
    scope.get<{ Params: { hostId: string } }>('/hosts/:hostId', { schema: { tags: ['Hosts'], summary: 'Get host by ID' } }, async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const { hostId } = request.params;
      const host = await hostRegistry.get(hostId, auth.namespaceId);
      if (!host) {
        return reply.code(404).send({ error: 'Host not found' });
      }
      return host;
    });

    // Deregister host (auth required)
    scope.delete<{ Params: { hostId: string } }>('/hosts/:hostId', { schema: { tags: ['Hosts'], summary: 'Deregister a host' } }, async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const { hostId } = request.params;
      const deleted = await hostRegistry.deregister(hostId, auth.namespaceId);
      if (!deleted) {
        return reply.code(404).send({ error: 'Host not found' });
      }
      return reply.code(204).send();
    });

    // Execute endpoint — public API for CLI/Studio clients (auth required)
    registerExecuteRoutes(scope as unknown as Parameters<typeof registerExecuteRoutes>[0], logger);

    // AI Gateway — OpenAI-compatible LLM endpoint (auth required)
    registerLLMGatewayRoutes(scope as unknown as Parameters<typeof registerLLMGatewayRoutes>[0], logger);

    // Telemetry ingestion — unified event collection (auth required)
    registerTelemetryRoutes(scope as unknown as Parameters<typeof registerTelemetryRoutes>[0], logger);

    // Unified Platform API — single dispatch for any adapter (auth required)
    registerPlatformRoutes(scope as unknown as Parameters<typeof registerPlatformRoutes>[0], logger);

    // Aggregated docs — /openapi-merged.json + /docs-all
    registerAggregatedDocsRoutes(scope as unknown as Parameters<typeof registerAggregatedDocsRoutes>[0], cache);


    // Internal dispatch endpoint
    const internalSecret = process.env.GATEWAY_INTERNAL_SECRET;
    scope.post('/internal/dispatch', async (request, reply) => {
      const provided = request.headers['x-internal-secret'];
      if (!internalSecret || provided !== internalSecret) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const body = request.body as {
        namespaceId?: string;
        hostId?: string;
        adapter?: string;
        method?: string;
        args?: unknown[];
      };

      if (!body.namespaceId || !body.adapter || !body.method) {
        return reply.code(400).send({ error: 'Missing required fields: namespaceId, adapter, method' });
      }

      const hostId = body.hostId
        ?? globalDispatcher.firstHostWithCapability(body.namespaceId, body.adapter)
        ?? globalDispatcher.firstHost(body.namespaceId);
      if (!hostId) {
        return reply.code(503).send({
          error: 'No host connected',
          namespaceId: body.namespaceId,
        });
      }

      try {
        const result = await globalDispatcher.call(
          body.namespaceId,
          hostId,
          body.adapter,
          body.method,
          body.args ?? [],
        );
        return { result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Host not connected')) {
          return reply.code(503).send({ error: message });
        }
        return reply.code(502).send({ error: message });
      }
    });

    // Internal host resolution endpoint
    scope.post('/internal/resolve-host', async (request, reply) => {
      const provided = request.headers['x-internal-secret'];
      if (!internalSecret || provided !== internalSecret) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const body = request.body as {
        namespaceId?: string;
        target?: {
          hostId?: string;
          hostSelection?: string;
          repoFingerprint?: string;
        };
      };

      const namespaceId = body.namespaceId ?? 'default';
      const target = body.target ?? {};
      const strategy = (target.hostSelection ?? 'any-matching') as string;

      let hostId: string | undefined;

      if (strategy === 'pinned' && target.hostId) {
        // Verify host exists and is reachable (online or reconnecting)
        const host = await hostRegistry.get(target.hostId, namespaceId);
        if (host?.status === 'online' || host?.status === 'reconnecting') {
          hostId = target.hostId;
        }
      } else {
        // any-matching / prefer-local / prefer-cloud: find first with execution capability
        hostId = globalDispatcher.firstHostWithCapability(namespaceId, 'execution');
      }

      if (!hostId) {
        return reply.code(404).send({ error: 'No matching host found' });
      }

      return { hostId, strategy, namespaceId };
    });
  });

  // ── Gateway WebSocket endpoints ────────────────────────────────────
  // Must be after ready() so http-proxy's upgrade listener is registered.
  // attachGatewayWs captures it, removes it, and installs a unified handler
  // that dispatches gateway WS paths to raw ws handlers and delegates
  // everything else (upstream WS proxy) to http-proxy.
  await app.ready();
  attachGatewayWs(app.server, cache, jwtConfig, logger, registry);

  return app;
}
