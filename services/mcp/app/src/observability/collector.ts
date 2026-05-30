/**
 * MCP Daemon observability collector.
 *
 * Mirrors the GatewayObservabilityCollector pattern: registers Fastify
 * onRequest/onResponse hooks for HTTP-level metrics, tracks domain operations
 * (mcp.tools.list, mcp.tool.call) via OperationMetricsTracker, and builds
 * the three standard observability payloads:
 *
 *   /health              → buildHealth()      (also used for /observability/health)
 *   /observability/describe → buildDescribe()
 *   /metrics             → renderPrometheusMetrics()
 *
 * All payloads are validated against the platform observability contract via
 * createServiceObservabilityDescribe / createServiceObservabilityHealth.
 */

import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import {
  OperationMetricsTracker,
  createServiceObservabilityDescribe,
  createServiceObservabilityHealth,
  resolveObservabilityInstanceId,
} from '@kb-labs/shared-http';

/** Domain operations tracked at the MCP level. */
export type McpOperation = 'mcp.tools.list' | 'mcp.tool.call';

export class McpObservabilityCollector {
  private readonly instanceId = resolveObservabilityInstanceId();
  private readonly startedAt = new Date().toISOString();
  private activeRequests = 0;
  private requestsTotal = 0;
  private errorsTotal = 0;
  private readonly ops = new OperationMetricsTracker();

  /**
   * Register Fastify hooks that track HTTP-level request counts and duration.
   * Must be called before routes are registered so the hooks apply to all routes.
   */
  register(server: FastifyInstance): void {
    server.addHook('onRequest', (req, _reply, done) => {
      req.kbMetricsStart = performance.now();
      this.activeRequests++;
      done();
    });

    server.addHook('onResponse', (req, reply, done) => {
      const start = req.kbMetricsStart;
      const durationMs = start != null ? performance.now() - start : 0;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.requestsTotal++;
      if (reply.statusCode >= 400) { this.errorsTotal++; }
      // Track HTTP ops in operation tracker for /metrics output.
      const route = (req.routeOptions?.url ?? req.url).replace(/[?#].*$/, '');
      this.ops.recordOperation(`http.${req.method} ${route}`, durationMs,
        reply.statusCode >= 400 ? 'error' : 'ok');
      done();
    });
  }

  /**
   * Record a completed domain operation. Called from request-handler after
   * each tools/list and tools/call cycle.
   */
  recordOp(name: McpOperation, durationMs: number, ok: boolean): void {
    this.ops.recordOperation(name, durationMs, ok ? 'ok' : 'error');
  }

  // ── Observability payload builders ──────────────────────────────────────

  buildDescribe(registryReady: boolean, toolCount: number) {
    return createServiceObservabilityDescribe({
      schema: 'kb.observability/1' as const,
      contractVersion: '1.0' as const,
      serviceId: 'mcp-daemon',
      instanceId: this.instanceId,
      serviceType: 'mcp-server',
      version: process.env.npm_package_version ?? '0.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      startedAt: this.startedAt,
      logsSource: 'mcp-daemon',
      dependencies: [],
      metricsEndpoint: '/metrics',
      healthEndpoint: '/observability/health',
      capabilities: ['httpMetrics', 'operationMetrics', 'logCorrelation'] as const,
      metricFamilies: [
        'process_rss_bytes',
        'process_heap_used_bytes',
        'service_active_operations',
        'http_requests_total',
        'http_errors_total',
        'service_operation_total',
        'service_operation_duration_ms',
      ] as const,
      meta: { toolCount, registryReady },
    });
  }

  buildHealth(registryReady: boolean, toolCount: number, executionMode: string) {
    const mem = process.memoryUsage();
    return createServiceObservabilityHealth({
      schema: 'kb.observability/1' as const,
      contractVersion: '1.0' as const,
      serviceId: 'mcp-daemon',
      instanceId: this.instanceId,
      observedAt: new Date().toISOString(),
      status: registryReady ? ('healthy' as const) : ('degraded' as const),
      uptimeSec: Math.floor(process.uptime()),
      logsSource: 'mcp-daemon',
      metricsEndpoint: '/metrics',
      capabilities: ['httpMetrics', 'operationMetrics', 'logCorrelation'] as const,
      snapshot: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        activeOperations: this.activeRequests,
      },
      checks: [
        {
          id: 'registry',
          status: (registryReady ? 'ok' : 'warn') as 'ok' | 'warn' | 'error',
          message: registryReady ? `${toolCount} tools loaded` : 'Registry not yet ready',
        },
        {
          id: 'execution',
          status: 'ok' as const,
          message: `mode=${executionMode}`,
        },
      ],
      topOperations: this.ops.getTopOperations(5),
    });
  }

  renderPrometheusMetrics(toolCount: number): string {
    const mem = process.memoryUsage();
    const lines: string[] = [
      '# HELP process_rss_bytes RSS memory in bytes',
      `process_rss_bytes ${mem.rss}`,
      '# HELP process_heap_used_bytes Heap used in bytes',
      `process_heap_used_bytes ${mem.heapUsed}`,
      '# HELP process_uptime_seconds Process uptime in seconds',
      `process_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP mcp_tools_total Number of tools registered in the current snapshot',
      `mcp_tools_total ${toolCount}`,
      '# HELP http_requests_total Total MCP HTTP requests received',
      `http_requests_total ${this.requestsTotal}`,
      '# HELP http_errors_total Total MCP HTTP 4xx/5xx responses',
      `http_errors_total ${this.errorsTotal}`,
      '# HELP service_active_operations Currently active MCP requests',
      `service_active_operations ${this.activeRequests}`,
      ...this.ops.getMetricLines(),
    ];
    return lines.join('\n');
  }
}
