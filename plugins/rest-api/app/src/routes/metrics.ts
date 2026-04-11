/**
 * @module @kb-labs/rest-api-app/routes/metrics
 * Metrics endpoint
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { metricsCollector, restDomainOperationMetrics } from '../middleware/metrics.js';
import { getHeaderDebugEntries } from '../diagnostics/header-debug';
import { getPrometheusMetrics, updateProcessUptime } from '../middleware/prom-metrics';

function formatNumber(value: number, fractionDigits = 2): string {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0';
}

/**
 * Register metrics routes
 */
export function registerMetricsRoutes(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  const basePath = config.basePath;

  // GET /metrics (Prometheus format with real p50/p95/p99)
  server.get(`${basePath}/metrics`, async (_request, reply) => {
    const metrics = metricsCollector.getMetrics();

    // Update process uptime before generating metrics
    updateProcessUptime(metrics.timestamps.startTime);

    // Get prom-client metrics (includes histogram with real percentiles)
    const promMetrics = await getPrometheusMetrics();

    // Append custom metrics not covered by prom-client
    const customLines: string[] = [];

    // Route-specific metrics (budget tracking)
    for (const entry of metrics.latency.histogram) {
      if (entry.budgetMs !== null) {
        const routeLabels = [`route="${entry.route}"`];
        if (entry.pluginId) {
          routeLabels.push(`plugin="${entry.pluginId}"`);
        }
        const labelString = routeLabels.join(',');
        customLines.push(`# HELP http_request_route_budget_ms Route performance budget in milliseconds`);
        customLines.push(`# TYPE http_request_route_budget_ms gauge`);
        customLines.push(`http_request_route_budget_ms{${labelString}} ${formatNumber(entry.budgetMs)}`);
      }
    }

    // Plugin mount snapshot
    const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();
    if (pluginSnapshot) {
      customLines.push(`# HELP kb_plugins_mount_total Plugins processed during last mount run`);
      customLines.push(`# TYPE kb_plugins_mount_total gauge`);
      customLines.push(`kb_plugins_mount_total ${pluginSnapshot.total}`);
      customLines.push(`kb_plugins_mount_succeeded ${pluginSnapshot.succeeded}`);
      customLines.push(`kb_plugins_mount_failed ${pluginSnapshot.failed}`);
      customLines.push(`kb_plugins_mount_elapsed_ms ${formatNumber(pluginSnapshot.elapsedMs)}`);
    }

    customLines.push(...restDomainOperationMetrics.getMetricLines());

    // Redis metrics (not in prom-client)
    customLines.push(`# HELP kb_redis_status_updates_total Redis status updates observed`);
    customLines.push(`# TYPE kb_redis_status_updates_total counter`);
    customLines.push(`kb_redis_status_updates_total ${metrics.redis.updates}`);

    customLines.push(`# HELP kb_redis_status_transitions_total Redis health transitions`);
    customLines.push(`# TYPE kb_redis_status_transitions_total counter`);
    customLines.push(`kb_redis_status_transitions_total{state="healthy"} ${metrics.redis.healthyTransitions}`);
    customLines.push(`kb_redis_status_transitions_total{state="unhealthy"} ${metrics.redis.unhealthyTransitions}`);

    if (metrics.redis.lastStatus) {
      const healthyValue = metrics.redis.lastStatus.healthy ? 1 : 0;
      customLines.push(`# HELP kb_redis_healthy Redis healthy flag (1 = healthy)`);
      customLines.push(`# TYPE kb_redis_healthy gauge`);
      customLines.push(`kb_redis_healthy ${healthyValue}`);

      for (const roleEntry of metrics.redis.roleStates) {
        for (const stateEntry of roleEntry.states) {
          const safeState = stateEntry.state.replace(/"/g, '\\"');
          customLines.push(
            `kb_redis_role_state_total{role="${roleEntry.role}",state="${safeState}"} ${stateEntry.count}`,
          );
        }
      }
    }

    // Combine prom-client metrics with custom metrics
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return promMetrics + '\n' + customLines.join('\n');
  });

  server.get(`${basePath}/metrics/headers/debug`, {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: { type: 'array' },
          },
        },
      },
    },
  }, async (request) => {
    const query = request.query as { limit?: number };
    const limit = typeof query?.limit === 'number' ? query.limit : 50;
    return {
      entries: getHeaderDebugEntries(limit),
    };
  });
}
