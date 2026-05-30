/**
 * MCP Daemon HTTP server.
 *
 * Exposes a single JSON-RPC endpoint (`/api/v1/mcp`) speaking the Model Context
 * Protocol over Streamable HTTP, plus the standard platform observability endpoints:
 *
 *   GET /health                 → McpObservabilityCollector.buildHealth()
 *   GET /ready                  → 200/503 based on registry readiness
 *   GET /metrics                → Prometheus text format
 *   GET /observability/describe → service identity + capabilities
 *   GET /observability/health   → full snapshot with checks and top operations
 *
 * Design notes:
 *  - The entity registry is initialized ONCE at start() and reused for every
 *    request; only the cheap, pure filterTools() runs per request.
 *  - This endpoint sits in front of the gateway's auth scope (the gateway proxies
 *    it as a dumb upstream), so the daemon validates the Bearer token itself via
 *    the shared GATEWAY_JWT_SECRET — exactly mirroring the gateway's AuthService.
 *  - Anonymous callers (no/invalid token) get an empty tool list and can never
 *    reach callTool/executeCommandV3.
 *  - tenantId flows end-to-end from AuthContext.namespaceId into executeCommandV3
 *    via the resolvePlatform seam — ready for per-tenant isolation without code
 *    changes here.
 */

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { can, type Policy, type Identity } from '@kb-labs/core-policy';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import { createCorrelatedLogger, resolveObservabilityInstanceId } from '@kb-labs/shared-http';
import { resolveAuthContext } from './mcp/auth.js';
import { toIdentity, actionForOperation, type Permits } from './mcp/authz.js';
import { createToolRegistry } from './mcp/tool-builder.js';
import { type PlatformResolver } from './mcp/tool-router.js';
import { resolveVisibleTools, executeToolCall } from './mcp/request-handler.js';
import { McpObservabilityCollector } from './observability/collector.js';

export interface McpDaemonServerOptions {
  port: number;
  host: string;
  socketPath?: string;
  logger: ILogger;
  cache: ICache;
  /** Default global platform container — used as the resolvePlatform fallback. */
  platform: PlatformContainer;
  /** Tenant → platform container seam. Defaults to always returning `platform`. */
  resolvePlatform?: PlatformResolver;
  /** Workspace root used to initialize the entity registry. */
  projectRoot: string;
  /** Platform installation root (installed mode); merges platform-level plugins. */
  platformRoot?: string;
  jwtConfig: JwtConfig;
  /** Authorization policy. Permit-all default until the platform supplies a real one. */
  policy: Policy;
}

export class McpDaemonServer {
  private readonly app: FastifyInstance;
  private readonly opts: McpDaemonServerOptions;
  private readonly resolvePlatform: PlatformResolver;
  private readonly collector: McpObservabilityCollector;
  private registry?: IEntityRegistry;

  constructor(opts: McpDaemonServerOptions) {
    this.opts = opts;
    this.resolvePlatform = opts.resolvePlatform ?? (() => opts.platform);
    this.collector = new McpObservabilityCollector();
    this.app = Fastify({ logger: false });
  }

  /** Build a per-request permits predicate bound to the identity (PDP seam). */
  private permitsFor(identity: Identity): Permits {
    return (operationType, resource) =>
      can(this.opts.policy, identity, actionForOperation(operationType), resource);
  }

  private get toolCount(): number {
    return (
      this.registry
        ?.snapshot()
        .manifests.flatMap((m) => m.manifest.cli?.commands ?? []).length ?? 0
    );
  }

  async start(): Promise<string> {
    // Initialize the registry ONCE; snapshot() is reused per request.
    this.registry = await createToolRegistry({
      root: this.opts.projectRoot,
      platformRoot: this.opts.platformRoot,
      cache: this.opts.cache,
    });

    this.registerRoutes();

    const address = this.opts.socketPath
      ? await this.app.listen({ path: this.opts.socketPath })
      : await this.app.listen({ port: this.opts.port, host: this.opts.host });

    this.opts.logger.info('MCP daemon listening', {
      address,
      socketPath: this.opts.socketPath,
    });
    return address;
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  private registerRoutes(): void {
    const { cache, logger, jwtConfig } = this.opts;
    const execMode = process.env.KB_MCP_EXECUTION_MODE ?? 'subprocess';

    // ── Observability hooks (onRequest/onResponse timing for all routes) ──
    this.collector.register(this.app);

    // ── Per-request correlated logger ──────────────────────────────────────
    // Attaches requestId + traceId to every incoming request, matching the
    // gateway and rest-api pattern.
    this.app.addHook('onRequest', async (request, reply) => {
      const requestId =
        (request.headers['x-request-id'] as string | undefined) ?? randomUUID();
      const traceId =
        (request.headers['x-trace-id'] as string | undefined) ?? randomUUID();
      reply.header('X-Request-Id', requestId).header('X-Trace-Id', traceId);
      request.kbLogger = createCorrelatedLogger(logger, {
        serviceId: 'mcp-daemon',
        instanceId: resolveObservabilityInstanceId(),
        logsSource: 'mcp-daemon',
        layer: 'mcp',
        requestId,
        traceId,
        operation: 'mcp.request',
        method: request.method,
        url: request.url,
      });
    });

    // ── Standard platform observability endpoints ──────────────────────────

    this.app.get('/health', async () =>
      this.collector.buildHealth(!!this.registry, this.toolCount, execMode),
    );

    this.app.get('/ready', async (_req, reply) => {
      const ready = !!this.registry;
      return reply.code(ready ? 200 : 503).send({ ready, service: 'mcp-daemon' });
    });

    this.app.get('/observability/describe', async () =>
      this.collector.buildDescribe(!!this.registry, this.toolCount),
    );

    this.app.get('/observability/health', async () =>
      this.collector.buildHealth(!!this.registry, this.toolCount, execMode),
    );

    this.app.get('/metrics', async (_req, reply) => {
      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return this.collector.renderPrometheusMetrics(this.toolCount);
    });

    // ── MCP JSON-RPC endpoint ──────────────────────────────────────────────

    // CORS headers for all MCP responses (including preflight OPTIONS).
    // fastify.all() covers every method including OPTIONS, so no separate
    // fastify.options() is needed — that would cause a duplicate-route error.
    this.app.all('/api/v1/mcp', async (request, reply) => {
      reply
        .header('Access-Control-Allow-Origin', '*')
        .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id');

      // Short-circuit preflight immediately — no auth or MCP processing needed.
      if (request.method === 'OPTIONS') {
        return reply.code(204).send();
      }

      const reqLogger = request.kbLogger ?? logger;

      // 1. Authenticate. Invalid/absent token → anonymous (no throw, no 401).
      const authHeader = request.headers.authorization;
      const authCtx = await resolveAuthContext(authHeader, cache, jwtConfig).catch(
        () => null,
      );
      const tenantId = authCtx?.namespaceId ?? 'anonymous';

      // Bind the authorization predicate to the identity once per request.
      // Anonymous callers get no predicate → they can neither list nor call tools.
      const permits = authCtx ? this.permitsFor(toIdentity(authCtx)) : null;

      // 2. Resolve the visible tool list (cached per identity). The cache is a
      //    listing optimization ONLY — executeToolCall re-checks the live policy.
      const visibleTools = await resolveVisibleTools({
        permits,
        authHeader,
        registry: this.registry!,
        cache,
        analytics: this.opts.platform.analytics,
        collector: this.collector,
        tenantId,
      });

      // 3. Build a stateless per-request MCP server.
      const mcp = new McpServer(
        { name: 'kb-labs', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );

      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: visibleTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as { type: 'object' },
        })),
      }));

      mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) =>
        executeToolCall({
          name: params.name,
          args: (params.arguments ?? {}) as Record<string, unknown>,
          visibleTools,
          permits,
          tenantId,
          resolvePlatform: this.resolvePlatform,
          analytics: this.opts.platform.analytics,
          collector: this.collector,
        }),
      );

      // 4. Streamable HTTP transport (stateless). Pass Fastify's parsed body —
      //    the raw stream is already consumed, so the SDK must not re-read it.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      try {
        await mcp.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
      } catch (error) {
        reqLogger.error('MCP request handling failed', error as Error);
        if (!reply.raw.headersSent) {
          reply.code(500).send({ error: 'internal_error' });
        }
      } finally {
        // Closing may reject if the transport is already torn down — swallow it
        // so it can never surface as an unhandled rejection after the response.
        await mcp.close().catch(() => {});
      }
    });
  }
}
