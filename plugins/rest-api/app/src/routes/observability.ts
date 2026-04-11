/**
 * @module @kb-labs/rest-api-app/routes/observability
 * Observability endpoints for monitoring system internals
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname } from 'node:os';
import type { HistoricalMetricsCollector } from '../services/historical-metrics';
import type { IncidentStorage } from '../services/incident-storage';
import { IncidentAnalyzer } from '../services/incident-analyzer';
import type { SystemMetrics } from '../services/system-metrics-collector';
import { metricsCollector } from '../middleware/metrics.js';

const execAsync = promisify(exec);

// DevKit health cache key and TTL (10 minutes)
// This prevents excessive process spawning that can overload the system
const DEVKIT_CACHE_KEY = 'observability:devkit-health';
const DEVKIT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Register observability routes
 *
 * These are system-level observability endpoints that expose internal metrics
 * and health information about platform components (State Broker, DevKit, etc.)
 */
export async function registerObservabilityRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string,
  historicalMetrics?: HistoricalMetricsCollector,
  incidentStorage?: IncidentStorage,
  platform?: PlatformServices
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);
  const stateBrokerPaths = resolvePaths(basePath, '/observability/state-broker');
  const devkitPaths = resolvePaths(basePath, '/observability/devkit');
  const systemMetricsPaths = resolvePaths(basePath, '/observability/system-metrics');
  const metricsHistoryPaths = resolvePaths(basePath, '/observability/metrics/history');
  const metricsHeatmapPaths = resolvePaths(basePath, '/observability/metrics/heatmap');
  const incidentsListPaths = resolvePaths(basePath, '/observability/incidents');
  const incidentsDetailPaths = resolvePaths(basePath, '/observability/incidents/:id');
  const incidentsCreatePaths = resolvePaths(basePath, '/observability/incidents');
  const incidentsHistoryPaths = resolvePaths(basePath, '/observability/incidents/history');
  const incidentsResolvePaths = resolvePaths(basePath, '/observability/incidents/:id/resolve');
  const incidentsAnalyzePaths = resolvePaths(basePath, '/observability/incidents/:id/analyze');
  const insightsChatPaths = resolvePaths(basePath, '/observability/insights/chat');

  // GET /api/v1/observability/state-broker
  // Returns statistics from State Broker daemon (cache hits, namespaces, etc.)
  for (const path of stateBrokerPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        const stateBrokerUrl = process.env.KB_STATE_DAEMON_URL || 'http://localhost:7777';

        fastify.log.debug({ url: stateBrokerUrl }, 'Fetching State Broker stats');

        const response = await fetch(`${stateBrokerUrl}/stats`, {
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
          fastify.log.warn({
            status: response.status,
            url: stateBrokerUrl,
          }, 'State Broker responded with error');

          return reply.code(503).send({
            ok: false,
            error: {
              code: 'STATE_BROKER_UNAVAILABLE',
              message: 'State Broker daemon is not available',
              details: {
                url: stateBrokerUrl,
                status: response.status,
              },
            },
          });
        }

        const stats = await response.json() as any;

        fastify.log.debug({
          totalEntries: stats.totalEntries,
          hitRate: stats.hitRate,
        }, 'State Broker stats retrieved successfully');

        return {
          ok: true,
          data: stats,
          meta: {
            source: 'state-broker',
            daemonUrl: stateBrokerUrl,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to fetch State Broker stats', error instanceof Error ? error : new Error(String(error)));

        // Check if it's a timeout error
        const isTimeout = error instanceof Error && error.name === 'AbortError';

        return reply.code(503).send({
          ok: false,
          error: {
            code: isTimeout ? 'STATE_BROKER_TIMEOUT' : 'STATE_BROKER_ERROR',
            message: isTimeout
              ? 'State Broker daemon did not respond in time'
              : error instanceof Error ? error.message : String(error),
            details: {
              isTimeout,
            },
          },
        });
      }
    });
  }

  // GET /api/v1/observability/devkit
  // Returns DevKit health check results (monorepo health score, issues, etc.)
  // CACHED for 10 minutes via platform.cache to prevent excessive process spawning
  for (const path of devkitPaths) {
    fastify.get(path, async (_request, reply) => {
      const now = Date.now();

      // Try to get from platform.cache first
      if (platform?.cache) {
        try {
          const cached = await platform.cache.get<{
            data: unknown;
            timestamp: number;
            expiresAt: number;
          }>(DEVKIT_CACHE_KEY);

          if (cached && now < cached.expiresAt) {
            const remainingTtl = Math.round((cached.expiresAt - now) / 1000);
            fastify.log.debug({ remainingTtl }, 'Returning cached DevKit health from platform.cache');

            return {
              ok: true,
              data: cached.data,
              meta: {
                source: 'devkit-cli',
                repoRoot,
                cached: true,
                cachedAt: cached.timestamp,
                expiresAt: cached.expiresAt,
                ttlSeconds: remainingTtl,
              },
            };
          }
        } catch (cacheError) {
          fastify.log.warn({ err: cacheError }, 'Failed to read from platform.cache, proceeding without cache');
        }
      }

      try {
        fastify.log.debug({ cwd: repoRoot }, 'Executing DevKit health check (cache miss)');

        const { stdout, stderr } = await execAsync('npx kb-devkit-health --json', {
          cwd: repoRoot,
          timeout: 30000, // 30s timeout
          env: {
            ...process.env,
            // Ensure DevKit runs in non-interactive mode
            CI: 'true',
          },
        });

        if (stderr) {
          fastify.log.warn({ stderr }, 'DevKit health check produced warnings');
        }

        const health = JSON.parse(stdout);
        const expiresAt = now + DEVKIT_CACHE_TTL_MS;

        // Cache the result for 10 minutes via platform.cache
        if (platform?.cache) {
          try {
            await platform.cache.set(DEVKIT_CACHE_KEY, {
              data: health,
              timestamp: now,
              expiresAt,
            }, DEVKIT_CACHE_TTL_MS);
            fastify.log.debug({
              healthScore: health.healthScore,
              grade: health.grade,
              cachedUntil: new Date(expiresAt).toISOString(),
            }, 'DevKit health check completed and cached in platform.cache');
          } catch (cacheError) {
            fastify.log.warn({ err: cacheError }, 'Failed to write to platform.cache');
          }
        }

        return {
          ok: true,
          data: health,
          meta: {
            source: 'devkit-cli',
            repoRoot,
            command: 'npx kb-devkit-health --json',
            cached: false,
            cachedAt: now,
            expiresAt,
            ttlSeconds: DEVKIT_CACHE_TTL_MS / 1000,
          },
        };
      } catch (error) {
        // Try to extract partial data from error's stdout
        let partialData: unknown = null;
        if (error && typeof error === 'object' && 'stdout' in error) {
          try {
            partialData = JSON.parse((error as { stdout: string }).stdout);
          } catch {
            partialData = null;
          }
        }

        platform?.logger.error('Failed to execute DevKit health check', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DEVKIT_ERROR',
            message: error instanceof Error ? error.message : 'Failed to execute DevKit health check',
            details: {
              partialData,
            },
          },
        });
      }
    });
  }

  // GET /api/v1/observability/system-metrics
  // Returns system resource metrics (CPU, memory, uptime, load) from all REST API instances
  for (const path of systemMetricsPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        if (!platform?.cache) {
          return reply.code(503).send({
            ok: false,
            error: {
              code: 'PLATFORM_CACHE_UNAVAILABLE',
              message: 'Platform cache is not available',
            },
          });
        }

        fastify.log.debug('Fetching system metrics from all instances');

        // Get all system-metrics:* keys from platform.cache
        const allMetrics: SystemMetrics[] = [];

        // Try to scan for all system-metrics keys
        // Note: platform.cache may not have scan(), so we'll handle both cases
        try {
          // Try to use scan if available (Redis adapter)
          if ('scan' in platform.cache && typeof (platform.cache as any).scan === 'function') {
            const keys = await (platform.cache as any).scan('system-metrics:*');

            for (const key of keys) {
              const metrics = await platform.cache.get<SystemMetrics>(key);
              if (metrics) {
                allMetrics.push(metrics);
              }
            }
          } else {
            // Fallback: InMemory adapter doesn't have scan, but we can try common instance IDs
            // This is a limitation - we won't see all instances unless we track them separately
            // For now, we'll just try to get the current instance's metrics
            const currentInstanceId = hostname();
            const metrics = await platform.cache.get<SystemMetrics>(`system-metrics:${currentInstanceId}`);

            if (metrics) {
              allMetrics.push(metrics);
            }

            fastify.log.debug('Platform cache does not support scan(), showing current instance only');
          }
        } catch (scanError) {
          fastify.log.warn({ err: scanError }, 'Failed to scan platform.cache for system metrics');

          // Fallback: try current instance
          const currentInstanceId = hostname();
          const metrics = await platform.cache.get<SystemMetrics>(`system-metrics:${currentInstanceId}`);

          if (metrics) {
            allMetrics.push(metrics);
          }
        }

        if (allMetrics.length === 0) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'NO_METRICS_FOUND',
              message: 'No system metrics found. Metrics collector may not be running.',
            },
          });
        }

        // Sort by timestamp (newest first)
        allMetrics.sort((a, b) => b.timestamp - a.timestamp);

        // Calculate aggregated metrics
        const now = Date.now();
        const avgCpu = allMetrics.reduce((sum, m) => sum + m.cpu.percentage, 0) / allMetrics.length;
        const avgMemory = allMetrics.reduce((sum, m) => sum + m.memory.rssPercentage, 0) / allMetrics.length;
        const avgHeap = allMetrics.reduce((sum, m) => sum + m.memory.heapPercentage, 0) / allMetrics.length;

        // Categorize instances by health status based on age
        const activeInstances = allMetrics.filter(m => (now - m.timestamp) < 30000); // Active if updated in last 30s
        const staleInstances = allMetrics.filter(m => (now - m.timestamp) >= 30000 && (now - m.timestamp) < 60000); // Stale if 30-60s old
        const deadInstances = allMetrics.filter(m => (now - m.timestamp) >= 60000); // Dead if >60s old

        fastify.log.debug({
          totalInstances: allMetrics.length,
          activeInstances: activeInstances.length,
          staleInstances: staleInstances.length,
          deadInstances: deadInstances.length,
        }, 'System metrics retrieved');

        return {
          ok: true,
          data: {
            instances: allMetrics,
            summary: {
              totalInstances: allMetrics.length,
              activeInstances: activeInstances.length,
              staleInstances: staleInstances.length,
              deadInstances: deadInstances.length,
              avgCpu: parseFloat(avgCpu.toFixed(2)),
              avgMemory: parseFloat(avgMemory.toFixed(2)),
              avgHeap: parseFloat(avgHeap.toFixed(2)),
            },
          },
          meta: {
            source: 'platform-cache',
            timestamp: now,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to fetch system metrics', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'SYSTEM_METRICS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch system metrics',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/metrics/history
  // Returns historical time-series metrics data
  for (const path of metricsHistoryPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: ['requests', 'errors', 'latency', 'uptime'],
            },
            range: {
              type: 'string',
              enum: ['1m', '5m', '10m', '30m', '1h'],
            },
            interval: {
              type: 'string',
              enum: ['5s', '1m', '5m'],
            },
          },
          required: ['metric', 'range'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    timestamp: { type: 'number' },
                    value: { type: 'number' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  metric: { type: 'string' },
                  range: { type: 'string' },
                  interval: { type: 'string' },
                  points: { type: 'number' },
                },
              },
            },
          },
        },
      },
    }, async (request, reply: any) => {
      if (!historicalMetrics) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_UNAVAILABLE',
            message: 'Historical metrics collector is not initialized',
          },
        });
      }

      const query = request.query as {
        metric: 'requests' | 'errors' | 'latency' | 'uptime';
        range: '1m' | '5m' | '10m' | '30m' | '1h';
        interval?: '5s' | '1m' | '5m';
      };

      try {
        fastify.log.debug({ query }, 'Querying historical metrics');

        const data = await historicalMetrics.queryHistory({
          metric: query.metric,
          range: query.range,
          interval: query.interval,
        });

        fastify.log.debug({
          metric: query.metric,
          range: query.range,
          points: data.length,
        }, 'Historical metrics retrieved');

        return {
          ok: true,
          data,
          meta: {
            source: 'historical-metrics-collector',
            metric: query.metric,
            range: query.range,
            interval: query.interval ?? '5s',
            points: data.length,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to query historical metrics', error instanceof Error ? error : new Error(String(error)), { query });

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query historical metrics',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/metrics/heatmap
  // Returns heatmap aggregated data (7 days × 24 hours)
  for (const path of metricsHeatmapPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: ['latency', 'errors', 'requests'],
            },
            days: {
              type: 'integer',
              enum: [7, 14, 30],
            },
          },
          required: ['metric'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    day: { type: 'string' },
                    hour: { type: 'number' },
                    value: { type: 'number' },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  metric: { type: 'string' },
                  days: { type: 'number' },
                  cells: { type: 'number' },
                },
              },
            },
          },
        },
      },
    }, async (request, reply: any) => {
      if (!historicalMetrics) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'HISTORICAL_METRICS_UNAVAILABLE',
            message: 'Historical metrics collector is not initialized',
          },
        });
      }

      const query = request.query as {
        metric: 'latency' | 'errors' | 'requests';
        days?: 7 | 14 | 30;
      };

      try {
        fastify.log.debug({ query }, 'Querying heatmap data');

        const data = await historicalMetrics.queryHeatmap({
          metric: query.metric,
          days: query.days ?? 7,
        });

        fastify.log.debug({
          metric: query.metric,
          cells: data.length,
        }, 'Heatmap data retrieved');

        return {
          ok: true,
          data,
          meta: {
            source: 'historical-metrics-collector',
            metric: query.metric,
            days: query.days ?? 7,
            cells: data.length,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to query heatmap data', error instanceof Error ? error : new Error(String(error)), { query });

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'HEATMAP_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query heatmap data',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/incidents
  // List incidents with filters (active by default, use includeResolved=true for all)
  for (const path of incidentsListPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 50 },
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info'],
            },
            type: {
              type: 'string',
              enum: ['error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom'],
            },
            from: { type: 'integer' },
            to: { type: 'integer' },
            includeResolved: { type: 'boolean', default: false },
          },
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENTS_NOT_CONFIGURED',
            message: 'Incident storage is not configured',
          },
        });
      }

      try {
        const query = request.query as any;
        const incidents = await incidentStorage.queryIncidents({
          limit: query.limit ?? 50,
          severity: query.severity,
          type: query.type,
          from: query.from,
          to: query.to,
          includeResolved: query.includeResolved ?? false,
        });

        // Get stats for summary
        const stats = await incidentStorage.getStats();

        return {
          ok: true,
          data: {
            incidents,
            summary: {
              total: stats.total,
              unresolved: stats.unresolved,
              bySeverity: stats.bySeverity,
              showing: incidents.length,
            },
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list incidents');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENTS_LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list incidents',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/incidents/:id
  // Get incident details by ID
  for (const path of incidentsDetailPaths) {
    fastify.get(path, {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENTS_NOT_CONFIGURED',
            message: 'Incident storage is not configured',
          },
        });
      }

      const { id } = request.params as { id: string };

      try {
        const incident = await incidentStorage.getIncident(id);

        if (!incident) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'INCIDENT_NOT_FOUND',
              message: `Incident ${id} not found`,
            },
          });
        }

        // Track analytics
        if (platform?.analytics) {
          platform.analytics.track('incident.viewed', {
            incidentId: id,
            type: incident.type,
            severity: incident.severity,
            isResolved: !!incident.resolvedAt,
            hasAIAnalysis: !!incident.aiAnalysis,
          }).catch(() => {
            // Silently ignore analytics errors
          });
        }

        return {
          ok: true,
          data: incident,
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get incident');

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get incident',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/incidents
  // Create a new incident record
  for (const path of incidentsCreatePaths) {
    fastify.post(path, {
      schema: {
        body: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom'],
            },
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info'],
            },
            title: { type: 'string' },
            details: { type: 'string' },
            rootCause: { type: 'string' },
            affectedServices: {
              type: 'array',
              items: { type: 'string' },
            },
            timestamp: { type: 'number' },
            metadata: { type: 'object' },
          },
          required: ['type', 'severity', 'title', 'details'],
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const payload = request.body as any;
        const incident = await incidentStorage.createIncident(payload);

        return {
          ok: true,
          data: incident,
          meta: {
            source: 'incident-storage',
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to create incident', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create incident',
          },
        });
      }
    });
  }

  // GET /api/v1/observability/incidents/history
  // Query incident history with filters
  for (const path of incidentsHistoryPaths) {
    fastify.get(path, {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 500 },
            severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
            type: {
              type: 'string',
              enum: ['error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom'],
            },
            from: { type: 'integer' },
            to: { type: 'integer' },
            includeResolved: { type: 'boolean' },
          },
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const query = request.query as any;
        const incidents = await incidentStorage.queryIncidents({
          limit: query.limit ?? 50,
          severity: query.severity,
          type: query.type,
          from: query.from,
          to: query.to,
          includeResolved: query.includeResolved ?? false,
        });

        return {
          ok: true,
          data: incidents,
          meta: {
            source: 'incident-storage',
            count: incidents.length,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to query incidents', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_QUERY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to query incidents',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/incidents/:id/resolve
  // Mark an incident as resolved
  for (const path of incidentsResolvePaths) {
    fastify.post(path, {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            resolutionNotes: { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENT_STORAGE_UNAVAILABLE',
            message: 'Incident storage is not initialized',
          },
        });
      }

      try {
        const { id } = request.params as { id: string };
        const body = request.body as { resolutionNotes?: string };

        const incident = await incidentStorage.resolveIncident(id, body.resolutionNotes);

        if (!incident) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'INCIDENT_NOT_FOUND',
              message: `Incident with id ${id} not found`,
            },
          });
        }

        return {
          ok: true,
          data: incident,
          meta: {
            source: 'incident-storage',
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to resolve incident', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INCIDENT_RESOLVE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to resolve incident',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/insights/chat
  // AI-powered insights chat using LLM with system metrics as context
  for (const path of insightsChatPaths) {
    fastify.post(path, {
      schema: {
        body: {
          type: 'object',
          properties: {
            question: { type: 'string', minLength: 1 },
            context: {
              type: 'object',
              properties: {
                includeMetrics: { type: 'boolean' },
                includeIncidents: { type: 'boolean' },
                includeHistory: { type: 'boolean' },
                timeRange: { type: 'string', enum: ['1h', '6h', '24h', '7d'] },
                plugins: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['question'],
        },
      },
    }, async (request, reply) => {
      if (!platform?.llm) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'LLM_UNAVAILABLE',
            message: 'LLM adapter is not configured. AI Insights requires an LLM adapter.',
          },
        });
      }

      try {
        const body = request.body as {
          question: string;
          context?: {
            includeMetrics?: boolean;
            includeIncidents?: boolean;
            includeHistory?: boolean;
            timeRange?: '1h' | '6h' | '24h' | '7d';
            plugins?: string[];
          };
        };

        const contextConfig = {
          includeMetrics: body.context?.includeMetrics ?? true,
          includeIncidents: body.context?.includeIncidents ?? true,
          includeHistory: body.context?.includeHistory ?? true,
          timeRange: body.context?.timeRange ?? '24h',
          plugins: body.context?.plugins ?? [],
        };

        // Build context from real data
        let contextText = '';

        // Fetch current metrics
        if (contextConfig.includeMetrics) {
          try {
            const metrics = metricsCollector.getMetrics();

            const errorRate = metrics.requests.total
              ? (((metrics.requests.clientErrors ?? 0) + (metrics.requests.serverErrors ?? 0)) / metrics.requests.total * 100)
              : 0;

            contextText += `\n## Current System Metrics\n`;
            contextText += `- Total requests: ${metrics.requests.total}\n`;
            contextText += `- Active requests: ${metrics.requests.active}\n`;
            contextText += `- Error rate: ${errorRate.toFixed(2)}%\n`;
            contextText += `- Average latency: ${metrics.latency.average.toFixed(0)}ms\n`;
            contextText += `- Max latency: ${metrics.latency.max.toFixed(0)}ms\n`;

            if (metrics.perPlugin.length > 0) {
              contextText += `\n### Per-Plugin Metrics\n`;
              const pluginsToShow = contextConfig.plugins.length > 0
                ? metrics.perPlugin.filter(plugin => plugin.pluginId && contextConfig.plugins.includes(plugin.pluginId))
                : metrics.perPlugin.slice(0, 10);

              for (const plugin of pluginsToShow) {
                const totalRequests = plugin.total ?? 0;
                const errorCount = Object.entries(plugin.statuses ?? {})
                  .filter(([statusGroup]) => statusGroup.startsWith('4') || statusGroup.startsWith('5'))
                  .reduce((sum, [, count]) => sum + count, 0);
                const pluginErrorRate = totalRequests > 0
                  ? (errorCount / totalRequests * 100).toFixed(2)
                  : '0.00';
                const avgLatency = totalRequests > 0 ? plugin.totalDuration / totalRequests : 0;
                contextText += `- ${plugin.pluginId ?? 'unknown'}: ${totalRequests} requests, ${pluginErrorRate}% errors, ${avgLatency.toFixed(0)}ms avg latency\n`;
              }
            }
          } catch (metricsError) {
            fastify.log.warn({ err: metricsError }, 'Failed to build metrics context for insights');
          }
        }

        // Fetch recent incidents
        if (contextConfig.includeIncidents && incidentStorage) {
          try {
            const incidents = await incidentStorage.queryIncidents({ limit: 10 });
            if (incidents.length > 0) {
              contextText += `\n## Recent Incidents (${incidents.length})\n`;
              for (const incident of incidents) {
                contextText += `- [${incident.severity.toUpperCase()}] ${incident.title}\n`;
                if (incident.details) {
                  contextText += `  Details: ${incident.details.slice(0, 100)}${incident.details.length > 100 ? '...' : ''}\n`;
                }
              }
            }
          } catch (incidentError) {
            fastify.log.warn({ err: incidentError }, 'Failed to fetch incidents for insights context');
          }
        }

        // Build prompt
        const prompt = `You are an AI assistant analyzing a software platform's observability data.

${contextText}

User Question: ${body.question}

Provide a clear, actionable response based on the data above. Include:
1. Direct answer to the question
2. Supporting evidence from the metrics/incidents
3. Recommendations if applicable

Be concise but thorough. Use markdown formatting.`;

        fastify.log.debug({ question: body.question, contextLength: contextText.length }, 'Calling LLM for insights');

        const result = await platform.llm.complete(prompt, {
          systemPrompt: 'You are a DevOps and SRE expert assistant. Analyze system metrics and provide actionable insights. Be concise, technical, and helpful.',
          temperature: 0.7,
          maxTokens: 1000,
        });

        const totalTokens = result.usage.promptTokens + result.usage.completionTokens;

        fastify.log.debug({ tokensUsed: totalTokens }, 'LLM response received for insights');

        // Track analytics
        if (platform.analytics) {
          platform.analytics.track('ai_insights.chat', {
            questionLength: body.question.length,
            contextIncluded: Object.keys(contextConfig).filter(k => (contextConfig as any)[k]),
            timeRange: contextConfig.timeRange,
            pluginsFiltered: contextConfig.plugins.length,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens,
            model: result.model,
          }).catch(() => {
            // Silently ignore analytics errors
          });
        }

        return {
          ok: true,
          data: {
            answer: result.content.trim(),
            context: Object.keys(contextConfig).filter(k => (contextConfig as any)[k]),
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens,
            },
          },
          meta: {
            source: 'llm-insights',
            model: result.model,
          },
        };
      } catch (error) {
        platform?.logger.error('Failed to generate insights', error instanceof Error ? error : new Error(String(error)));

        // Track error analytics
        if (platform?.analytics) {
          platform.analytics.track('ai_insights.error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            questionLength: (request.body as any)?.question?.length ?? 0,
          }).catch(() => {
            // Silently ignore analytics errors
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INSIGHTS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate insights',
          },
        });
      }
    });
  }

  // POST /api/v1/observability/incidents/:id/analyze
  // Analyze incident using AI to identify root causes and recommendations
  for (const path of incidentsAnalyzePaths) {
    fastify.post(path, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'INCIDENTS_NOT_CONFIGURED',
            message: 'Incident storage is not configured',
          },
        });
      }

      const { id } = request.params as { id: string };

      try {
        // Fetch incident
        const incident = await incidentStorage.getIncident(id);

        if (!incident) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'INCIDENT_NOT_FOUND',
              message: `Incident ${id} not found`,
            },
          });
        }

        // Check if already analyzed
        if (incident.aiAnalysis && incident.aiAnalyzedAt) {
          const ageMs = Date.now() - incident.aiAnalyzedAt;
          const ageMinutes = Math.floor(ageMs / 60000);

          // Return cached analysis if less than 1 hour old
          if (ageMs < 60 * 60 * 1000) {
            return {
              ok: true,
              data: {
                ...incident.aiAnalysis,
                cached: true,
                analyzedAt: incident.aiAnalyzedAt,
                ageMinutes,
              },
            };
          }
        }

        // Analyze incident with LLM
        const analyzer = new IncidentAnalyzer(
          {
            debug: process.env.NODE_ENV !== 'production',
          },
          fastify.log as any
        );

        const analysis = await analyzer.analyze(incident);

        // Store analysis in incident
        await incidentStorage.updateAIAnalysis(id, analysis);

        // Track analytics
        if (platform?.analytics) {
          platform.analytics.track('incident.analyzed', {
            incidentId: id,
            type: incident.type,
            severity: incident.severity,
            rootCausesCount: analysis.rootCauses.length,
            recommendationsCount: analysis.recommendations.length,
          }).catch(() => {
            // Silently ignore analytics errors
          });
        }

        return {
          ok: true,
          data: {
            ...analysis,
            cached: false,
          },
        };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to analyze incident');

        // Track error in analytics
        if (platform?.analytics) {
          platform.analytics.track('incident.analysis_error', {
            incidentId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
          }).catch(() => {
            // Silently ignore analytics errors
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'ANALYSIS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to analyze incident',
          },
        });
      }
    });
  }

  // ========================================
  // TEST ENDPOINTS (for incident testing)
  // ========================================

  // Test endpoint: Create incident manually
  const testCreateIncidentPaths = resolvePaths(basePath, '/test/create-incident');
  for (const path of testCreateIncidentPaths) {
    fastify.post(path, async (request, reply) => {
      if (!incidentStorage) {
        return reply.code(500).send({
          ok: false,
          error: { code: 'INCIDENT_STORAGE_NOT_INITIALIZED', message: 'Incident storage not initialized' },
        });
      }

      try {
        const {
          type = 'custom',
          severity = 'warning',
          title = 'Test Incident',
          details,
          relatedData,
        } = request.body as any;

        const incident = await incidentStorage.createIncident({
          type,
          severity,
          title,
          details: details || 'This is a test incident created manually for testing purposes.',
          timestamp: Date.now(),
          metadata: {
            testMode: true,
            createdVia: 'test-endpoint',
          },
          relatedData: relatedData || {
            timeline: [
              {
                timestamp: Date.now(),
                event: 'Test incident created via /test/create-incident',
                source: 'manual' as const,
              },
            ],
          },
        });

        fastify.log.info({ id: incident.id }, 'Test incident created');

        return { ok: true, data: incident };
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to create test incident');
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'TEST_INCIDENT_CREATION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to create test incident',
          },
        });
      }
    });
  }

  // Test endpoint: Trigger errors (auto-creates error_rate incident)
  const testTriggerErrorsPaths = resolvePaths(basePath, '/test/trigger-errors');
  for (const path of testTriggerErrorsPaths) {
    fastify.get(path, async (request, reply) => {
      const { count = 10 } = request.query as any;
      const errorCount = Math.min(Math.max(1, parseInt(count, 10) || 10), 100); // 1-100 errors

      fastify.log.info(`Triggering ${errorCount} test errors`);

      // Generate errors
      for (let i = 0; i < errorCount; i++) {
        // Log errors to platform
        platform?.logger.error(`Test error ${i + 1}/${errorCount}`, undefined, {
          testMode: true,
          errorNumber: i + 1,
          totalErrors: errorCount,
        });

        // Make the request fail to increase error rate
        if (i === errorCount - 1) {
          // Last error - return error response
          return reply.code(500).send({
            ok: false,
            error: {
              code: 'TEST_ERROR_TRIGGERED',
              message: `Generated ${errorCount} test errors. Check /observability/incidents in ~30 seconds for auto-created incident.`,
            },
          });
        }
      }

      return {
        ok: true,
        message: `Triggered ${errorCount} test errors. Incident should be auto-created in next detection cycle (~30s).`,
      };
    });
  }

  // Test endpoint: Simulate high latency (auto-creates latency_spike incident)
  const testSimulateLatencyPaths = resolvePaths(basePath, '/test/simulate-latency');
  for (const path of testSimulateLatencyPaths) {
    fastify.get(path, async (request, reply) => {
      const { delay = 2000 } = request.query as any;
      const delayMs = Math.min(Math.max(100, parseInt(delay, 10) || 2000), 10000); // 100ms-10s

      fastify.log.info(`Simulating ${delayMs}ms latency`);

      // Simulate slow response
      await new Promise(resolve => {
        setTimeout(resolve, delayMs);
      });

      return {
        ok: true,
        message: `Simulated ${delayMs}ms latency. Call this endpoint multiple times to trigger latency_spike incident.`,
        actualDelay: delayMs,
      };
    });
  }

  // Test endpoint: Bulk error generator (guaranteed to trigger incident)
  const testBulkErrorsPaths = resolvePaths(basePath, '/test/bulk-errors');
  for (const path of testBulkErrorsPaths) {
    fastify.post(path, async (request, reply) => {
      const { successCount = 10, errorCount = 50 } = request.body as any;

      fastify.log.info({ successCount, errorCount }, 'Generating bulk requests for incident testing');

      // Generate successful requests
      for (let i = 0; i < successCount; i++) {
        platform?.logger.info(`Bulk test - success ${i + 1}/${successCount}`);
      }

      // Generate error requests with varied endpoints
      const testEndpoints = [
        'POST /api/v1/test/endpoint-a',
        'GET /api/v1/test/endpoint-b',
        'PUT /api/v1/test/endpoint-c',
        'DELETE /api/v1/test/endpoint-d',
        'POST /api/v1/test/endpoint-e',
      ];

      for (let i = 0; i < errorCount; i++) {
        const endpoint = testEndpoints[i % testEndpoints.length];
        const errorTypes = [
          'Connection timeout',
          'Validation failed',
          'Database query error',
          'Authentication failed',
          'Rate limit exceeded',
        ];
        const errorType = errorTypes[i % errorTypes.length];

        platform?.logger.error(`${errorType}: ${endpoint}`, undefined, {
          testMode: true,
          bulkTest: true,
          errorIndex: i,
          endpoint,
        });
      }

      const totalRequests = successCount + errorCount;
      const errorRate = (errorCount / totalRequests) * 100;

      return {
        ok: true,
        message: `Generated ${totalRequests} requests (${successCount} success, ${errorCount} errors)`,
        errorRate: `${errorRate.toFixed(1)}%`,
        note: 'Incident should be auto-created in next detection cycle (~30s)',
      };
    });
  }

  fastify.log.info('Observability routes registered (including test endpoints)');
}
