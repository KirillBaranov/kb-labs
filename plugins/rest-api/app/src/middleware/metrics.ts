import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
type RedisStatus = {
  enabled: boolean;
  healthy: boolean;
  roles: { publisher?: string | null; subscriber?: string | null; cache?: string | null };
};
import { OperationMetricsTracker } from '@kb-labs/shared-http';
import {
  httpRequestDuration,
  httpRequestsTotal,
  httpErrorsTotal,
  serviceActiveOperations,
  serviceOperationDuration,
  serviceOperationTotal,
  tenantRequestsTotal,
  tenantErrorsTotal,
  tenantRequestDuration,
} from './prom-metrics';
import { platform } from '@kb-labs/core-runtime';

/**
 * @module @kb-labs/rest-api-app/middleware/metrics
 * Metrics collection middleware
 */

/**
 * Metrics data
 */
type RedisRole = 'publisher' | 'subscriber' | 'cache';

interface RedisMetrics {
  updates: number;
  healthyTransitions: number;
  unhealthyTransitions: number;
  lastUpdateTs: number | null;
  lastHealthyTs: number | null;
  lastUnhealthyTs: number | null;
  lastStatus: {
    enabled: boolean;
    healthy: boolean;
    roles: Record<RedisRole, string | null>;
  } | null;
  roleStates: Record<RedisRole, Record<string, number>>;
}

interface Metrics {
  requests: {
    total: number;
    active: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    byRoute: Record<string, number>;
    byTenant: Record<string, number>; // ← Multi-tenancy support
  };
  latency: {
    total: number;
    count: number;
    min: number;
    max: number;
    average: number;
    histogram: Map<string, RouteLatencyStats>;
  };
  errors: {
    total: number;
    byCode: Record<string, number>;
  };
  timestamps: {
    startTime: number;
    lastRequest: number;
  };
  headers: {
    filteredInbound: number;
    filteredOutbound: number;
    sensitiveInbound: number;
    validationErrors: number;
    varyApplied: number;
    dryRunDecisions: number;
    byPlugin: Record<string, HeaderPluginMetrics>;
  };
  redis: RedisMetrics;
  // ← Multi-tenancy support
  perTenant: Map<string, {
    total: number;
    errors: number;
    totalLatency: number;
  }>;
}

type RouteLatencyStats = {
  count: number;
  total: number;
  max: number;
  byStatus: Record<string, number>;
};

type HeaderPluginMetrics = {
  filteredInbound: number;
  filteredOutbound: number;
  validationErrors: number;
  varyApplied: number;
  sensitiveInbound: number;
};

type HeaderMetricsEntry = {
  pluginId?: string;
  routeId?: string;
  filteredInbound: number;
  filteredOutbound: number;
  sensitiveInbound: number;
  validationErrors: number;
  varyApplied: number;
  dryRun: boolean;
};

export type PluginsMetricsSnapshot = {
  total: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
};

type PluginsMetricsDetails = Record<string, {
  routes: number;
  status: 'ok' | 'failed';
  durationMs: number;
  lastError?: string;
}>;

class PluginsMetricsCollector {
  private metrics: PluginsMetricsSnapshot & { details: PluginsMetricsDetails } = this.createDefault();

  private createDefault(): PluginsMetricsSnapshot & { details: PluginsMetricsDetails } {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      elapsedMs: 0,
      details: {},
    };
  }

  reset(): void {
    this.metrics = this.createDefault();
  }

  recordSuccess(pluginId: string, routes: number, durationMs: number): void {
    this.metrics.total += 1;
    this.metrics.succeeded += 1;
    this.metrics.elapsedMs += durationMs;
    this.metrics.details[pluginId] = {
      routes,
      status: 'ok',
      durationMs,
    };
  }

  recordFailure(pluginId: string, error: string): void {
    this.metrics.total += 1;
    this.metrics.failed += 1;
    this.metrics.details[pluginId] = {
      routes: 0,
      status: 'failed',
      durationMs: 0,
      lastError: error,
    };
  }

  getSnapshot(): PluginsMetricsSnapshot {
    return {
      total: this.metrics.total,
      succeeded: this.metrics.succeeded,
      failed: this.metrics.failed,
      elapsedMs: Number(this.metrics.elapsedMs.toFixed(2)),
    };
  }

  getDetails(): PluginsMetricsDetails {
    return this.metrics.details;
  }
}

export interface MetricsSnapshot {
  requests: Metrics['requests'] & {
    success: number;
    clientErrors: number;
    serverErrors: number;
  };
  latency: Omit<Metrics['latency'], 'histogram'> & {
    histogram: Array<{
      route: string;
      count: number;
      total: number;
      max: number;
      byStatus: Record<string, number>;
      budgetMs: number | null;
      pluginId?: string;
    }>;
  };
  perPlugin: Array<{
    pluginId?: string;
    total: number;
    totalDuration: number;
    maxDuration: number;
    statuses: Record<string, number>;
  }>;
  perTenant: Array<{
    tenantId: string;
    total: number;
    errors: number;
    avgLatencyMs: number;
  }>;
  errors: Metrics['errors'];
  timestamps: Metrics['timestamps'];
  headers: {
    filteredInbound: number;
    filteredOutbound: number;
    sensitiveInbound: number;
    validationErrors: number;
    varyApplied: number;
    dryRunDecisions: number;
    perPlugin: Array<{
      pluginId: string;
      filteredInbound: number;
      filteredOutbound: number;
      validationErrors: number;
      varyApplied: number;
      sensitiveInbound: number;
    }>;
  };
  redis: {
    updates: number;
    healthyTransitions: number;
    unhealthyTransitions: number;
    lastUpdateTs: number | null;
    lastHealthyTs: number | null;
    lastUnhealthyTs: number | null;
    lastStatus: {
      enabled: boolean;
      healthy: boolean;
      roles: Record<RedisRole, string | null>;
    } | null;
    roleStates: Array<{
      role: RedisRole;
      states: Array<{ state: string; count: number }>;
    }>;
  };
}

class MetricsCollector {
  private metrics: Metrics = this.createMetrics();
  private pluginsMetrics = new PluginsMetricsCollector();
  private lastPluginSnapshot: PluginsMetricsSnapshot | null = null;
  private pluginRouteBudgets = new Map<string, { budgetMs: number | null; pluginId?: string }>();

  private createMetrics(): Metrics {
    return {
      requests: {
        total: 0,
        active: 0,
        byMethod: {},
        byStatus: {},
        byRoute: {},
        byTenant: {}, // ← Multi-tenancy support
      },
      latency: {
        total: 0,
        count: 0,
        min: Infinity,
        max: 0,
        average: 0,
        histogram: new Map<string, RouteLatencyStats>(),
      },
      errors: {
        total: 0,
        byCode: {},
      },
      timestamps: {
        startTime: Date.now(),
        lastRequest: Date.now(),
      },
      headers: {
        filteredInbound: 0,
        filteredOutbound: 0,
        sensitiveInbound: 0,
        validationErrors: 0,
        varyApplied: 0,
        dryRunDecisions: 0,
        byPlugin: {},
      },
      redis: this.createRedisMetrics(),
      perTenant: new Map(), // ← Multi-tenancy support
    };
  }

  private createRedisMetrics(): RedisMetrics {
    return {
      updates: 0,
      healthyTransitions: 0,
      unhealthyTransitions: 0,
      lastUpdateTs: null,
      lastHealthyTs: null,
      lastUnhealthyTs: null,
      lastStatus: null,
      roleStates: {
        publisher: {},
        subscriber: {},
        cache: {},
      },
    };
  }

  recordRequest(method: string, route: string, statusCode: number, durationMs: number, tenantId?: string): void {
    this.metrics.requests.total++;
    this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    this.metrics.requests.byStatus[statusGroup] = (this.metrics.requests.byStatus[statusGroup] || 0) + 1;

    const normalizedRoute = normalizeRoute(route);
    if (normalizedRoute) {
      const routeBucket = `${method} ${normalizedRoute}`;
      this.metrics.requests.byRoute[routeBucket] = (this.metrics.requests.byRoute[routeBucket] || 0) + 1;
      updateLatencyHistogram(this.metrics.latency.histogram, routeBucket, durationMs, statusCode);
    }

    // ← Multi-tenancy support: track by tenant
    if (tenantId) {
      this.metrics.requests.byTenant[tenantId] = (this.metrics.requests.byTenant[tenantId] || 0) + 1;

      const tenantStats = this.metrics.perTenant.get(tenantId) || {
        total: 0,
        errors: 0,
        totalLatency: 0,
      };
      tenantStats.total++;
      tenantStats.totalLatency += durationMs;
      if (statusCode >= 400) {
        tenantStats.errors++;
      }
      this.metrics.perTenant.set(tenantId, tenantStats);
    }

    this.metrics.latency.count++;
    this.metrics.latency.total += durationMs;
    this.metrics.latency.min = Math.min(this.metrics.latency.min, durationMs);
    this.metrics.latency.max = Math.max(this.metrics.latency.max, durationMs);
    this.metrics.latency.average = this.metrics.latency.total / this.metrics.latency.count;
    this.metrics.timestamps.lastRequest = Date.now();
  }

  incrementActiveRequests(): number {
    this.metrics.requests.active += 1;
    return this.metrics.requests.active;
  }

  decrementActiveRequests(): number {
    this.metrics.requests.active = Math.max(0, this.metrics.requests.active - 1);
    return this.metrics.requests.active;
  }

  getActiveRequests(): number {
    return this.metrics.requests.active;
  }

  recordError(errorCode: string): void {
    this.metrics.errors.total++;
    this.metrics.errors.byCode[errorCode] = (this.metrics.errors.byCode[errorCode] || 0) + 1;
  }

  recordHeaderMetrics(entry: HeaderMetricsEntry): void {
    const headers = this.metrics.headers;
    headers.filteredInbound += Math.max(0, entry.filteredInbound);
    headers.filteredOutbound += Math.max(0, entry.filteredOutbound);
    headers.sensitiveInbound += Math.max(0, entry.sensitiveInbound);
    headers.validationErrors += Math.max(0, entry.validationErrors);
    headers.varyApplied += Math.max(0, entry.varyApplied);
    if (entry.dryRun) {
      headers.dryRunDecisions += Math.max(
        0,
        entry.filteredInbound + entry.filteredOutbound + entry.validationErrors
      );
    }

    if (entry.pluginId) {
      const existing: HeaderPluginMetrics = headers.byPlugin[entry.pluginId] ?? {
        filteredInbound: 0,
        filteredOutbound: 0,
        validationErrors: 0,
        varyApplied: 0,
        sensitiveInbound: 0,
      };
      existing.filteredInbound += Math.max(0, entry.filteredInbound);
      existing.filteredOutbound += Math.max(0, entry.filteredOutbound);
      existing.validationErrors += Math.max(0, entry.validationErrors);
      existing.varyApplied += Math.max(0, entry.varyApplied);
      existing.sensitiveInbound += Math.max(0, entry.sensitiveInbound);
      headers.byPlugin[entry.pluginId] = existing;
    }
  }

  recordRedisStatus(status: RedisStatus | null): void {
    if (!status) {
      return;
    }
    const now = Date.now();
    const redisMetrics = this.metrics.redis;
    const previous = redisMetrics.lastStatus;

    redisMetrics.updates += 1;
    redisMetrics.lastUpdateTs = now;
    if (status.healthy) {
      redisMetrics.lastHealthyTs = now;
    } else {
      redisMetrics.lastUnhealthyTs = now;
    }

    if (previous && previous.healthy !== status.healthy) {
      if (status.healthy) {
        redisMetrics.healthyTransitions += 1;
      } else {
        redisMetrics.unhealthyTransitions += 1;
      }
    }

    const normalizedRoles: Record<RedisRole, string | null> = {
      publisher: status.roles.publisher ?? null,
      subscriber: status.roles.subscriber ?? null,
      cache: status.roles.cache ?? null,
    };

    (Object.keys(normalizedRoles) as RedisRole[]).forEach((role) => {
      const state = normalizedRoles[role] ?? 'unknown';
      const bucket = state ?? 'unknown';
      redisMetrics.roleStates[role][bucket] =
        (redisMetrics.roleStates[role][bucket] ?? 0) + 1;
    });

    redisMetrics.lastStatus = {
      enabled: status.enabled,
      healthy: status.healthy,
      roles: normalizedRoles,
    };
  }

  getMetrics(): MetricsSnapshot {
    const avg = this.metrics.latency.count > 0
      ? this.metrics.latency.total / this.metrics.latency.count
      : 0;

    const perPluginMap = new Map<string, {
      pluginId?: string;
      total: number;
      totalDuration: number;
      maxDuration: number;
      statuses: Record<string, number>;
    }>();

    const histogramArray = Array.from(this.metrics.latency.histogram.entries()).map(([route, stats]) => {
      const entry = this.pluginRouteBudgets.get(route);
      const pluginId = entry?.pluginId;
      if (pluginId) {
        let aggregate = perPluginMap.get(pluginId);
        if (!aggregate) {
          aggregate = {
            pluginId,
            total: 0,
            totalDuration: 0,
            maxDuration: 0,
            statuses: {},
          };
          perPluginMap.set(pluginId, aggregate);
        }
        aggregate.total += stats.count;
        aggregate.totalDuration += stats.total;
        aggregate.maxDuration = Math.max(aggregate.maxDuration, stats.max);
        for (const [statusCode, count] of Object.entries(stats.byStatus)) {
          aggregate.statuses[statusCode] = (aggregate.statuses[statusCode] || 0) + count;
        }
      }

      return {
        route,
        count: stats.count,
        total: stats.total,
        max: stats.max,
        byStatus: { ...stats.byStatus },
        budgetMs: entry?.budgetMs ?? null,
        pluginId,
      };
    });

    const headerPerPlugin = Object.entries(this.metrics.headers.byPlugin).map(([pluginId, data]) => ({
      pluginId,
      filteredInbound: data.filteredInbound,
      filteredOutbound: data.filteredOutbound,
      validationErrors: data.validationErrors,
      varyApplied: data.varyApplied,
      sensitiveInbound: data.sensitiveInbound,
    }));

    const redisRoleStates = (Object.keys(this.metrics.redis.roleStates) as RedisRole[]).map((role) => ({
      role,
      states: Object.entries(this.metrics.redis.roleStates[role]).map(([state, count]) => ({
        state,
        count,
      })),
    }));

    const lastRedisStatus = this.metrics.redis.lastStatus
      ? {
          enabled: this.metrics.redis.lastStatus.enabled,
          healthy: this.metrics.redis.lastStatus.healthy,
          roles: { ...this.metrics.redis.lastStatus.roles },
        }
      : null;

    // Serialize perTenant Map to Array
    const perTenantArray = Array.from(this.metrics.perTenant.entries()).map(([tenantId, stats]) => ({
      tenantId,
      total: stats.total,
      errors: stats.errors,
      avgLatencyMs: stats.total > 0 ? stats.totalLatency / stats.total : 0,
    }));

    // Calculate success/error counts from byStatus
    const success = (this.metrics.requests.byStatus['2xx'] || 0) + (this.metrics.requests.byStatus['3xx'] || 0);
    const clientErrors = this.metrics.requests.byStatus['4xx'] || 0;
    const serverErrors = this.metrics.requests.byStatus['5xx'] || 0;

    return {
      requests: {
        ...this.metrics.requests,
        success,
        clientErrors,
        serverErrors,
      },
      latency: {
        total: this.metrics.latency.total,
        count: this.metrics.latency.count,
        min: this.metrics.latency.min,
        max: this.metrics.latency.max,
        average: avg,
        histogram: histogramArray,
      },
      perPlugin: Array.from(perPluginMap.values()),
      perTenant: perTenantArray,
      errors: { ...this.metrics.errors, byCode: { ...this.metrics.errors.byCode } },
      timestamps: { ...this.metrics.timestamps },
      headers: {
        filteredInbound: this.metrics.headers.filteredInbound,
        filteredOutbound: this.metrics.headers.filteredOutbound,
        sensitiveInbound: this.metrics.headers.sensitiveInbound,
        validationErrors: this.metrics.headers.validationErrors,
        varyApplied: this.metrics.headers.varyApplied,
        dryRunDecisions: this.metrics.headers.dryRunDecisions,
        perPlugin: headerPerPlugin,
      },
      redis: {
        updates: this.metrics.redis.updates,
        healthyTransitions: this.metrics.redis.healthyTransitions,
        unhealthyTransitions: this.metrics.redis.unhealthyTransitions,
        lastUpdateTs: this.metrics.redis.lastUpdateTs,
        lastHealthyTs: this.metrics.redis.lastHealthyTs,
        lastUnhealthyTs: this.metrics.redis.lastUnhealthyTs,
        lastStatus: lastRedisStatus,
        roleStates: redisRoleStates,
      },
    };
  }

  reset(): void {
    this.metrics = this.createMetrics();
    this.pluginsMetrics.reset();
    this.lastPluginSnapshot = null;
  }

  beginPluginMount(): PluginsMetricsCollector {
    this.pluginsMetrics.reset();
    return this.pluginsMetrics;
  }

  completePluginMount(logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }): PluginsMetricsSnapshot | null {
    const snapshot = this.pluginsMetrics.getSnapshot();
    this.lastPluginSnapshot = snapshot;
    if (snapshot.total === 0) {
      return snapshot;
    }

    logger.info('Plugin mount metrics', snapshot);
    if (snapshot.failed > 0) {
      logger.warn('Plugin mount failures', this.pluginsMetrics.getDetails());
    }

    this.pluginsMetrics.reset();
    return snapshot;
  }

  getLastPluginMountSnapshot(): PluginsMetricsSnapshot | null {
    return this.lastPluginSnapshot;
  }

  registerRouteBudget(
    method: string,
    routePath: string,
    budgetMs: number | null | undefined,
    pluginId?: string
  ): void {
    const normalized = normalizeRoute(routePath);
    if (!normalized) {
      return;
    }
    const bucket = `${method.toUpperCase()} ${normalized}`;
    this.pluginRouteBudgets.set(bucket, { budgetMs: budgetMs ?? null, pluginId });
  }

  resetPluginRouteBudgets(): void {
    this.pluginRouteBudgets.clear();
  }

  getRouteBudget(method: string, routePath: string): number | null {
    const normalized = normalizeRoute(routePath);
    if (!normalized) {
      return null;
    }
    const bucket = `${method.toUpperCase()} ${normalized}`;
    const entry = this.pluginRouteBudgets.get(bucket);
    return entry ? entry.budgetMs ?? null : null;
  }
}

export const metricsCollector = new MetricsCollector();
export const restDomainOperationMetrics = new OperationMetricsTracker();

/**
 * Sampling strategy for high-frequency endpoints to prevent analytics overload.
 *
 * - /metrics: 1:100 (Prometheus scraping happens every few seconds)
 * - /health, /ready, /observability/health, /observability/describe: 1:10
 * - All other endpoints: 1:1 (track everything)
 *
 * Uses deterministic sampling based on request counter to ensure even distribution.
 */
let requestCounter = 0;
function shouldSampleRequest(route: string): boolean {
  requestCounter = (requestCounter + 1) % 100;

  // High-frequency metrics endpoints (Prometheus scraping) - sample 1:100
  if (route === '/api/v1/metrics') {
    return requestCounter === 0; // Only track every 100th request
  }

  // Medium-frequency health and observability probes - sample 1:10
  if (
    route === '/api/v1/health' ||
    route === '/api/v1/ready' ||
    route === '/api/v1/observability/health' ||
    route === '/api/v1/observability/describe'
  ) {
    return requestCounter % 10 === 0; // Only track every 10th request
  }

  // All other endpoints - track every request (1:1)
  return true;
}

export function registerMetricsMiddleware(server: FastifyInstance): void {
  server.addHook('onRequest', (request, _reply, done) => {
    request.kbMetricsStart = performance.now();
    serviceActiveOperations.set(metricsCollector.incrementActiveRequests());
    done();
  });

  server.addHook('onResponse', (request, reply, done) => {
    const start = request.kbMetricsStart ?? performance.now();
    const duration = Math.max(performance.now() - start, 0);
    const method = (request.method || request.raw.method || 'GET').toUpperCase();
    const routePath = request.routeOptions?.url ?? request.url;

    // Extract tenantId from header or env var
    const tenantId = (request.headers['x-tenant-id'] as string | undefined) ?? process.env.KB_TENANT_ID ?? 'default';

    // Log request completion with method + full URL + status code + duration
    if (request.kbLogger) {
      const fullUrl = request.url;
      const durationMs = Math.round(duration);
      request.kbLogger.info(`✓ ${method} ${fullUrl} ${reply.statusCode} ${durationMs}ms`, {
        statusCode: reply.statusCode,
        durationMs,
      });
    }

    // Record to legacy collector
    metricsCollector.recordRequest(method, routePath ?? request.url, reply.statusCode, duration, tenantId);
    if (reply.statusCode >= 400) {
      metricsCollector.recordError(String(reply.statusCode));
    }

    // Record to prom-client metrics
    const normalizedRoute = normalizeRoute(routePath ?? request.url) ?? 'unknown';
    const statusCode = String(reply.statusCode);
    const operation = `http.${method} ${normalizedRoute}`;

    // Record request duration histogram (automatically calculates p50/p95/p99)
    httpRequestDuration.observe(
      {
        method,
        route: normalizedRoute,
        status_code: statusCode,
        tenant: tenantId,
        plugin: '', // Will be populated from route metadata if available
      },
      duration
    );

    // Record request counter
    httpRequestsTotal.inc({
      method,
      route: normalizedRoute,
      status_code: statusCode,
      tenant: tenantId,
      plugin: '',
    });

    // Record errors
    if (reply.statusCode >= 400) {
      httpErrorsTotal.inc({
        status_code: statusCode,
        error_code: String(reply.errorCode ?? reply.statusCode),
        tenant: tenantId,
      });
      tenantErrorsTotal.inc({ tenant: tenantId });
    }

    serviceOperationTotal.inc({
      operation,
      status: reply.statusCode >= 400 ? 'error' : 'ok',
    });
    serviceOperationDuration.observe(
      {
        operation,
        status: reply.statusCode >= 400 ? 'error' : 'ok',
      },
      duration,
    );

    // Record tenant metrics
    tenantRequestsTotal.inc({ tenant: tenantId });
    tenantRequestDuration.observe({ tenant: tenantId }, duration);

    // Track to analytics for long-term storage (async, fire-and-forget)
    // This enables quarterly/annual reports and endpoint usage analysis
    // Skip OPTIONS (CORS preflight) - they don't carry useful information
    if (method !== 'OPTIONS') {
      const { analytics } = platform;
      if (analytics) {
        // Sample high-frequency probe endpoints (1:100 for metrics, 1:10 for health/ready/observability)
        // This prevents overwhelming analytics with 142k+ ping-pong events
        const shouldSample = shouldSampleRequest(normalizedRoute);

        if (shouldSample) {
          analytics.track('api.request', {
            endpoint: normalizedRoute,
            method,
            statusCode: reply.statusCode,
            durationMs: Math.round(duration),
            tenantId,
            pluginId: request.kbPluginId ?? undefined,
            clientVersion: request.headers['x-client-version'] as string | undefined,
            userAgent: request.headers['user-agent'] as string | undefined,
            requestId: request.id as string | undefined,
          }).catch(() => {
            // Silently ignore analytics errors - should not affect request handling
          });
        }
      }
    }

    serviceActiveOperations.set(metricsCollector.decrementActiveRequests());
    done();
  });
}

function normalizeRoute(route: string): string | null {
  if (!route) {
    return null;
  }
  const routePath = route.split('?')[0];
  if (!routePath) {
    return null;
  }
  return routePath.replace(/\/[0-9a-fA-F-]{6,}/g, '/:id');
}

function updateLatencyHistogram(
  histogram: Map<string, RouteLatencyStats>,
  bucket: string,
  durationMs: number,
  statusCode: number
): void {
  let stats = histogram.get(bucket);
  if (!stats) {
    stats = { count: 0, total: 0, max: 0, byStatus: {} };
    histogram.set(bucket, stats);
  }
  stats.count += 1;
  stats.total += durationMs;
  stats.max = Math.max(stats.max, durationMs);
  const statusKey = `${statusCode}`;
  stats.byStatus[statusKey] = (stats.byStatus[statusKey] || 0) + 1;
}
