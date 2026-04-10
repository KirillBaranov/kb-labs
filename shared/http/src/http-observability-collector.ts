import { hostname } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import {
  OBSERVABILITY_CONTRACT_VERSION,
  OBSERVABILITY_SCHEMA,
  CANONICAL_OBSERVABILITY_METRICS,
  type ObservabilityCapability,
  type ObservabilityCheck,
  type ServiceDependencyDescriptor,
  type ServiceHealthStatus,
  type ServiceObservabilityDescribe,
  type ServiceObservabilityHealth,
  type ServiceObservabilityState,
  type ServiceOperationSample,
} from '@kb-labs/core-contracts';
import {
  createServiceObservabilityDescribe,
  createServiceObservabilityHealth,
} from './service-observability.js';
import { OperationMetricsTracker, type OperationStatus } from './operation-metrics-tracker.js';

declare module 'fastify' {
  interface FastifyRequest {
    kbObservabilityStart?: number;
  }
}

type RouteStats = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
};

type HookableFastifyServer = {
  addHook: any;
};

export interface HttpObservabilityCollectorOptions {
  serviceId: string;
  serviceType: string;
  version: string;
  metricsEndpoint?: string;
  healthEndpoint?: string;
  logsSource?: string;
  environment?: string;
  dependencies?: ServiceDependencyDescriptor[];
  capabilities?: ObservabilityCapability[];
  startedAtMs?: number;
}

export function normalizeObservabilityRoute(route: string | undefined): string {
  if (!route) {
    return 'unknown';
  }

  return route
    .split('?')[0]!
    .replace(/\/[0-9a-fA-F-]{6,}/g, '/:id');
}

export function metricLine(name: string, value: number, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return `${name} ${value}`;
  }

  const pairs = Object.entries(labels).map(([key, labelValue]) => `${key}="${labelValue.replace(/"/g, '\\"')}"`);
  return `${name}{${pairs.join(',')}} ${value}`;
}

function deriveState(status: ServiceHealthStatus): ServiceObservabilityState {
  if (status === 'healthy') {
    return 'active';
  }
  if (status === 'degraded') {
    return 'partial_observability';
  }
  return 'insufficient_data';
}

export class HttpObservabilityCollector {
  private readonly instanceId = `${hostname()}:${process.pid}`;
  private readonly startedAtMs: number;
  private readonly metricsEndpoint: string;
  private readonly healthEndpoint: string;
  private readonly logsSource: string;
  private readonly environment: string;
  private readonly dependencies: ServiceDependencyDescriptor[];
  private readonly capabilities: ObservabilityCapability[];
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 });
  private readonly routeStats = new Map<string, RouteStats>();
  private readonly operationMetrics = new OperationMetricsTracker();
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();
  private intervalId: NodeJS.Timeout | null = null;
  private activeOperations = 0;
  private requestsTotal = 0;
  private errorsTotal = 0;
  private runtimeSnapshotCollectedAt = new Date().toISOString();
  private lastSnapshot = {
    cpuPercent: 0,
    rssBytes: process.memoryUsage().rss,
    heapUsedBytes: process.memoryUsage().heapUsed,
    eventLoopLagMs: 0,
  };

  constructor(private readonly options: HttpObservabilityCollectorOptions) {
    this.startedAtMs = options.startedAtMs ?? Date.now();
    this.metricsEndpoint = options.metricsEndpoint ?? '/metrics';
    this.healthEndpoint = options.healthEndpoint ?? '/observability/health';
    this.logsSource = options.logsSource ?? options.serviceId;
    this.environment = options.environment ?? process.env.NODE_ENV ?? 'development';
    this.dependencies = options.dependencies ?? [];
    this.capabilities = options.capabilities ?? ['httpMetrics', 'eventLoopMetrics', 'operationMetrics', 'logCorrelation'];
  }

  register(server: HookableFastifyServer): void {
    this.eventLoop.enable();
    this.intervalId = setInterval(() => this.captureRuntimeSnapshot(), 10_000);
    this.captureRuntimeSnapshot();

    server.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction) => {
      request.kbObservabilityStart = performance.now();
      this.activeOperations += 1;
      done();
    });

    server.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
      const started = request.kbObservabilityStart ?? performance.now();
      const durationMs = Math.max(performance.now() - started, 0);
      const route = `${request.method.toUpperCase()} ${normalizeObservabilityRoute(request.routeOptions?.url ?? request.url)}`;
      const stats = this.routeStats.get(route) ?? {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        errorCount: 0,
      };

      stats.count += 1;
      stats.totalDurationMs += durationMs;
      stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
      if (reply.statusCode >= 400) {
        stats.errorCount += 1;
        this.errorsTotal += 1;
      }

      this.routeStats.set(route, stats);
      this.requestsTotal += 1;
      this.activeOperations = Math.max(0, this.activeOperations - 1);
      done();
    });

    server.addHook('onClose', (_instance: unknown, done: HookHandlerDoneFunction) => {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.eventLoop.disable();
      done();
    });
  }

  buildDescribe(): ServiceObservabilityDescribe {
    return createServiceObservabilityDescribe({
      schema: OBSERVABILITY_SCHEMA,
      contractVersion: OBSERVABILITY_CONTRACT_VERSION,
      serviceId: this.options.serviceId,
      instanceId: this.instanceId,
      serviceType: this.options.serviceType,
      version: this.options.version,
      environment: this.environment,
      startedAt: new Date(this.startedAtMs).toISOString(),
      dependencies: this.dependencies,
      metricsEndpoint: this.metricsEndpoint,
      healthEndpoint: this.healthEndpoint,
      logsSource: this.logsSource,
      capabilities: this.capabilities,
      metricFamilies: [...CANONICAL_OBSERVABILITY_METRICS],
    });
  }

  buildHealth(input: {
    status: ServiceHealthStatus;
    checks: ObservabilityCheck[];
    observedAt?: string;
    state?: ServiceObservabilityState;
    topOperations?: ServiceOperationSample[];
    meta?: Record<string, unknown>;
  }): ServiceObservabilityHealth {
    const topOperations = input.topOperations
      ? mergeTopOperations(input.topOperations, this.operationMetrics.getTopOperations())
      : mergeTopOperations(this.getTopOperations(), this.operationMetrics.getTopOperations());

    return createServiceObservabilityHealth({
      schema: OBSERVABILITY_SCHEMA,
      contractVersion: OBSERVABILITY_CONTRACT_VERSION,
      serviceId: this.options.serviceId,
      instanceId: this.instanceId,
      observedAt: input.observedAt ?? new Date().toISOString(),
      status: input.status,
      uptimeSec: Math.floor((Date.now() - this.startedAtMs) / 1000),
      metricsEndpoint: this.metricsEndpoint,
      logsSource: this.logsSource,
      capabilities: this.capabilities,
      checks: input.checks,
      snapshot: {
        cpuPercent: this.lastSnapshot.cpuPercent,
        rssBytes: this.lastSnapshot.rssBytes,
        heapUsedBytes: this.lastSnapshot.heapUsedBytes,
        eventLoopLagMs: this.lastSnapshot.eventLoopLagMs,
        activeOperations: this.activeOperations,
      },
      topOperations,
      state: input.state ?? deriveState(input.status),
      meta: {
        requestsTotal: this.requestsTotal,
        errorsTotal: this.errorsTotal,
        runtimeMetricsCollectedAt: this.runtimeSnapshotCollectedAt,
        ...(input.meta ?? {}),
      },
    });
  }

  getTopOperations(limit = 5): ServiceOperationSample[] {
    return Array.from(this.routeStats.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].maxDurationMs - a[1].maxDurationMs)
      .slice(0, limit)
      .map(([operation, stats]) => ({
        operation: `http.${operation}`,
        count: stats.count,
        avgDurationMs: stats.count > 0 ? stats.totalDurationMs / stats.count : 0,
        maxDurationMs: stats.maxDurationMs,
        errorCount: stats.errorCount,
      }));
  }

  recordOperation(operation: string, durationMs = 0, status: OperationStatus = 'ok', count = 1): void {
    this.operationMetrics.recordOperation(operation, durationMs, status, count);
  }

  observeOperation<T>(operation: string, work: () => T | Promise<T>): Promise<T> {
    return this.operationMetrics.observeOperation(operation, work);
  }

  renderPrometheusMetrics(healthStatus: ServiceHealthStatus, extraLines: string[] = []): string {
    this.captureRuntimeSnapshot();

    const lines = [
      '# HELP process_cpu_percent Current process CPU usage percentage',
      '# TYPE process_cpu_percent gauge',
      metricLine('process_cpu_percent', this.lastSnapshot.cpuPercent),
      '# HELP process_rss_bytes Current process resident set size in bytes',
      '# TYPE process_rss_bytes gauge',
      metricLine('process_rss_bytes', this.lastSnapshot.rssBytes),
      '# HELP process_heap_used_bytes Current process heap used in bytes',
      '# TYPE process_heap_used_bytes gauge',
      metricLine('process_heap_used_bytes', this.lastSnapshot.heapUsedBytes),
      '# HELP process_event_loop_lag_ms Current event loop lag in milliseconds',
      '# TYPE process_event_loop_lag_ms gauge',
      metricLine('process_event_loop_lag_ms', this.lastSnapshot.eventLoopLagMs),
      '# HELP service_health_status Service health status (2=healthy, 1=degraded, 0=unhealthy)',
      '# TYPE service_health_status gauge',
      metricLine('service_health_status', healthStatus === 'healthy' ? 2 : healthStatus === 'degraded' ? 1 : 0),
      '# HELP service_restarts_total Service restart counter within current process lifetime',
      '# TYPE service_restarts_total gauge',
      metricLine('service_restarts_total', 0),
      '# HELP service_active_operations Current number of active operations',
      '# TYPE service_active_operations gauge',
      metricLine('service_active_operations', this.activeOperations),
      '# HELP http_requests_total Total number of HTTP requests',
      '# TYPE http_requests_total counter',
      '# HELP http_errors_total Total number of HTTP errors (4xx, 5xx)',
      '# TYPE http_errors_total counter',
      '# HELP http_request_duration_ms Total duration of HTTP requests grouped by route',
      '# TYPE http_request_duration_ms summary',
      '# HELP service_operation_total Total number of service operations',
      '# TYPE service_operation_total counter',
      '# HELP service_operation_duration_ms Total duration of service operations grouped by route',
      '# TYPE service_operation_duration_ms summary',
    ];

    for (const [route, stats] of this.routeStats.entries()) {
      const status = stats.errorCount > 0 ? 'error' : 'ok';
      lines.push(metricLine('http_requests_total', stats.count, { route }));
      lines.push(metricLine('http_errors_total', stats.errorCount, { route }));
      lines.push(metricLine('http_request_duration_ms', Number(stats.totalDurationMs.toFixed(2)), { route }));
      lines.push(metricLine('service_operation_total', stats.count, { operation: `http.${route}`, status }));
      lines.push(metricLine('service_operation_duration_ms', Number(stats.totalDurationMs.toFixed(2)), { operation: `http.${route}`, status }));
    }

    lines.push(...this.operationMetrics.getMetricLines(), ...extraLines);
    return `${lines.join('\n')}\n`;
  }

  private captureRuntimeSnapshot(): void {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const deltaTime = Math.max(currentTime - this.lastCpuTime, 1);

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;

    const cpuTimeMs = (currentUsage.user + currentUsage.system) / 1000;
    const memory = process.memoryUsage();
    const eventLoopLagMs = this.eventLoop.exceeds === 0 && !Number.isFinite(this.eventLoop.mean / 1_000_000)
      ? 0
      : Number((this.eventLoop.mean / 1_000_000).toFixed(2));

    this.lastSnapshot = {
      cpuPercent: Number(Math.min((cpuTimeMs / deltaTime) * 100, 100).toFixed(2)),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      eventLoopLagMs: Number.isFinite(eventLoopLagMs) ? eventLoopLagMs : 0,
    };
    this.runtimeSnapshotCollectedAt = new Date(currentTime).toISOString();
    this.eventLoop.reset();
  }
}

function mergeTopOperations(
  baseOperations: ServiceOperationSample[],
  domainOperations: ServiceOperationSample[],
  limit = 5,
): ServiceOperationSample[] {
  const merged = new Map<string, ServiceOperationSample>();

  for (const item of [...baseOperations, ...domainOperations]) {
    const existing = merged.get(item.operation);
    if (!existing) {
      merged.set(item.operation, { ...item });
      continue;
    }

    const count = (existing.count ?? 0) + (item.count ?? 0);
    const totalDurationMs =
      (existing.avgDurationMs ?? 0) * (existing.count ?? 0) +
      (item.avgDurationMs ?? 0) * (item.count ?? 0);

    merged.set(item.operation, {
      operation: item.operation,
      count,
      avgDurationMs: count > 0 ? totalDurationMs / count : 0,
      maxDurationMs: Math.max(existing.maxDurationMs ?? 0, item.maxDurationMs ?? 0),
      errorCount: (existing.errorCount ?? 0) + (item.errorCount ?? 0),
    });
  }

  const ranked = Array.from(merged.values())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (b.maxDurationMs ?? 0) - (a.maxDurationMs ?? 0))
  const sliced = ranked.slice(0, limit);

  if (domainOperations.length === 0 || sliced.some((item) => !item.operation.startsWith('http.'))) {
    return sliced;
  }

  const firstDomainOperation = ranked.find((item) => !item.operation.startsWith('http.'));
  if (!firstDomainOperation) {
    return sliced;
  }

  return [...sliced.slice(0, Math.max(0, limit - 1)), firstDomainOperation];
}
