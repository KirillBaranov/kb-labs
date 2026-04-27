/**
 * @module @kb-labs/rest-api-app/services/incident-detector
 * Automatic incident detection based on metrics thresholds
 */

import type { IncidentStorage, IncidentCreatePayload, IncidentSeverity, IncidentType, RelatedData } from './incident-storage';
import { metricsCollector } from '../middleware/metrics.js';
import type { MetricsSnapshot } from '../middleware/metrics.js';
import { platform } from '@kb-labs/core-runtime';
import type { LogLevel } from '@kb-labs/core-platform';

interface LogEntryFields {
  err?: { message?: string; stack?: string };
  plugin?: string;
  command?: string;
  endpoint?: string;
  url?: string;
}

/**
 * Detection thresholds configuration
 */
export interface DetectionThresholds {
  /** Error rate threshold (percentage, default: 5%) */
  errorRateWarning: number;
  /** Error rate critical threshold (percentage, default: 10%) */
  errorRateCritical: number;
  /** P99 latency warning threshold (ms, default: 2000) */
  latencyP99Warning: number;
  /** P99 latency critical threshold (ms, default: 5000) */
  latencyP99Critical: number;
  /** P95 latency warning threshold (ms, default: 1000) */
  latencyP95Warning: number;
  /** Minimum requests before triggering (default: 10) */
  minRequestsForDetection: number;
  /** Plugin error rate threshold (percentage, default: 10%) */
  pluginErrorRateWarning: number;
  /** Plugin error rate critical threshold (percentage, default: 25%) */
  pluginErrorRateCritical: number;
}

/**
 * Detector configuration
 */
export interface IncidentDetectorConfig {
  /** Detection interval in milliseconds (default: 30000 - 30s) */
  intervalMs: number;
  /** Thresholds for detection */
  thresholds: DetectionThresholds;
  /** Cooldown period before creating same incident again (ms, default: 5 minutes) */
  cooldownMs: number;
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_THRESHOLDS: DetectionThresholds = {
  errorRateWarning: 5,
  errorRateCritical: 10,
  latencyP99Warning: 2000,
  latencyP99Critical: 5000,
  latencyP95Warning: 1000,
  minRequestsForDetection: 10,
  pluginErrorRateWarning: 10,
  pluginErrorRateCritical: 25,
};

const DEFAULT_CONFIG: IncidentDetectorConfig = {
  intervalMs: 30000, // 30 seconds
  thresholds: DEFAULT_THRESHOLDS,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
  debug: false,
};

/**
 * Track recently created incidents to avoid duplicates
 */
interface RecentIncident {
  type: IncidentType;
  key: string; // unique key for deduplication (e.g., "error_rate" or "plugin:@kb-labs/foo")
  timestamp: number;
}

/**
 * Automatic incident detector service
 *
 * Periodically analyzes metrics and creates incidents when thresholds are exceeded.
 * Includes deduplication to avoid spamming with repeated incidents.
 */
export class IncidentDetector {
  private incidentStorage: IncidentStorage;
  private config: IncidentDetectorConfig;
  private logger: Console;
  private intervalHandle: NodeJS.Timeout | null = null;
  private recentIncidents: RecentIncident[] = [];
  private isRunning = false;

  // Metrics history for "before" comparison (last 10 snapshots)
  private metricsHistory: Array<{
    timestamp: number;
    errorRate: number;
    avgLatency: number;
    totalRequests: number;
  }> = [];

  constructor(
    incidentStorage: IncidentStorage,
    config: Partial<IncidentDetectorConfig> = {},
    logger: Console = console
  ) {
    this.incidentStorage = incidentStorage;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: { ...DEFAULT_THRESHOLDS, ...config.thresholds },
    };
    this.logger = logger;
  }

  /**
   * Start automatic detection
   */
  start(): void {
    if (this.isRunning) {
      this.log('warn', 'Detector already running');
      return;
    }

    this.isRunning = true;
    this.log('info', 'Starting incident detector', {
      intervalMs: this.config.intervalMs,
      thresholds: this.config.thresholds,
    });

    // Run immediately once
    this.runDetection().catch(err => {
      this.log('error', 'Initial detection failed', { error: err.message });
    });

    // Schedule periodic detection
    this.intervalHandle = setInterval(() => {
      this.runDetection().catch(err => {
        this.log('error', 'Detection cycle failed', { error: err.message });
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop automatic detection
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.log('info', 'Incident detector stopped');
  }

  /**
   * Run a single detection cycle
   */
  async runDetection(): Promise<void> {
    const metrics = metricsCollector.getMetrics();
    const now = Date.now();

    // Save current metrics to history (for "before" comparison)
    const totalErrors = (metrics.requests.clientErrors ?? 0) + (metrics.requests.serverErrors ?? 0);
    const errorRate = metrics.requests.total > 0
      ? (totalErrors / metrics.requests.total) * 100
      : 0;

    this.metricsHistory.push({
      timestamp: now,
      errorRate,
      avgLatency: metrics.latency.average ?? 0,
      totalRequests: metrics.requests.total,
    });

    // Keep only last 10 snapshots (5 minutes history if running every 30s)
    if (this.metricsHistory.length > 10) {
      this.metricsHistory.shift();
    }

    // Clean up old recent incidents (outside cooldown period)
    this.recentIncidents = this.recentIncidents.filter(
      ri => now - ri.timestamp < this.config.cooldownMs
    );

    // Skip if not enough requests
    if (metrics.requests.total < this.config.thresholds.minRequestsForDetection) {
      this.log('debug', 'Not enough requests for detection', {
        total: metrics.requests.total,
        min: this.config.thresholds.minRequestsForDetection,
      });
      return;
    }

    // Detect error rate issues
    await this.detectErrorRate(metrics, now);

    // Detect latency issues
    await this.detectLatencyIssues(metrics, now);

    // Detect plugin failures
    await this.detectPluginFailures(metrics, now);

    this.log('debug', 'Detection cycle complete', {
      recentIncidentsCount: this.recentIncidents.length,
    });
  }

  /**
   * Detect high error rate
   */
  private async detectErrorRate(metrics: MetricsSnapshot, now: number): Promise<void> {
    const totalErrors = (metrics.requests.clientErrors ?? 0) + (metrics.requests.serverErrors ?? 0);
    const errorRate = metrics.requests.total > 0
      ? (totalErrors / metrics.requests.total) * 100
      : 0;

    const key = 'error_rate';

    if (this.isInCooldown(key)) {
      return;
    }

    let severity: IncidentSeverity | null = null;
    let title = '';
    let details = '';

    if (errorRate >= this.config.thresholds.errorRateCritical) {
      severity = 'critical';
      title = `Critical Error Rate: ${errorRate.toFixed(1)}%`;
      details = `Error rate has exceeded critical threshold of ${this.config.thresholds.errorRateCritical}%. ` +
        `Current: ${errorRate.toFixed(2)}% (${totalErrors}/${metrics.requests.total} requests). ` +
        `Client errors: ${metrics.requests.clientErrors ?? 0}, Server errors: ${metrics.requests.serverErrors ?? 0}.`;
    } else if (errorRate >= this.config.thresholds.errorRateWarning) {
      severity = 'warning';
      title = `High Error Rate: ${errorRate.toFixed(1)}%`;
      details = `Error rate has exceeded warning threshold of ${this.config.thresholds.errorRateWarning}%. ` +
        `Current: ${errorRate.toFixed(2)}% (${totalErrors}/${metrics.requests.total} requests).`;
    }

    if (severity) {
      await this.createIncident({
        type: 'error_rate',
        severity,
        title,
        details,
        metadata: {
          errorRate,
          totalRequests: metrics.requests.total,
          clientErrors: metrics.requests.clientErrors,
          serverErrors: metrics.requests.serverErrors,
          threshold: severity === 'critical'
            ? this.config.thresholds.errorRateCritical
            : this.config.thresholds.errorRateWarning,
        },
      }, key, now);
    }
  }

  /**
   * Detect latency spikes
   */
  private async detectLatencyIssues(metrics: MetricsSnapshot, now: number): Promise<void> {
    // We need to fetch p99 from histogram data
    // For now, use average as approximation if p99 not available
    const avgLatency = metrics.latency.average ?? 0;

    // Try to calculate p99 from histogram if available
    let p99 = avgLatency * 3; // rough approximation
    let p95 = avgLatency * 2;

    if (metrics.latency.histogram && metrics.latency.histogram.length > 0) {
      // Sort by max latency and take top percentiles
      const sorted = [...metrics.latency.histogram].sort((a, b) => b.max - a.max);
      if (sorted.length > 0) {
        p99 = sorted[0]?.max ?? p99;
        p95 = sorted[Math.floor(sorted.length * 0.05)]?.max ?? p95;
      }
    }

    const keyP99 = 'latency_p99';
    const keyP95 = 'latency_p95';

    // Check P99 latency
    if (!this.isInCooldown(keyP99)) {
      let severity: IncidentSeverity | null = null;
      let title = '';
      let details = '';

      if (p99 >= this.config.thresholds.latencyP99Critical) {
        severity = 'critical';
        title = `Critical P99 Latency: ${p99.toFixed(0)}ms`;
        details = `P99 latency has exceeded critical threshold of ${this.config.thresholds.latencyP99Critical}ms. ` +
          `Current P99: ${p99.toFixed(0)}ms, Average: ${avgLatency.toFixed(0)}ms. ` +
          `This indicates severe performance degradation affecting tail latencies.`;
      } else if (p99 >= this.config.thresholds.latencyP99Warning) {
        severity = 'warning';
        title = `High P99 Latency: ${p99.toFixed(0)}ms`;
        details = `P99 latency has exceeded warning threshold of ${this.config.thresholds.latencyP99Warning}ms. ` +
          `Current P99: ${p99.toFixed(0)}ms, Average: ${avgLatency.toFixed(0)}ms.`;
      }

      if (severity) {
        await this.createIncident({
          type: 'latency_spike',
          severity,
          title,
          details,
          metadata: {
            p99,
            p95,
            average: avgLatency,
            threshold: severity === 'critical'
              ? this.config.thresholds.latencyP99Critical
              : this.config.thresholds.latencyP99Warning,
          },
        }, keyP99, now);
      }
    }

    // Check P95 latency (separate incident)
    if (!this.isInCooldown(keyP95) && p95 >= this.config.thresholds.latencyP95Warning) {
      await this.createIncident({
        type: 'latency_spike',
        severity: 'warning',
        title: `Elevated P95 Latency: ${p95.toFixed(0)}ms`,
        details: `P95 latency has exceeded threshold of ${this.config.thresholds.latencyP95Warning}ms. ` +
          `Current P95: ${p95.toFixed(0)}ms. Consider investigating slow endpoints.`,
        metadata: {
          p95,
          average: avgLatency,
          threshold: this.config.thresholds.latencyP95Warning,
        },
      }, keyP95, now);
    }
  }

  /**
   * Detect plugin failures
   */
  private async detectPluginFailures(metrics: MetricsSnapshot, now: number): Promise<void> {
    if (!metrics.perPlugin || !Array.isArray(metrics.perPlugin)) {
      return;
    }

    type PluginMetricsEntry = {
      pluginId?: string;
      requests?: number;
      errors?: number;
      latency?: { average?: number };
    };

    for (const plugin of metrics.perPlugin as PluginMetricsEntry[]) {
      if (!plugin.pluginId || (plugin.requests ?? 0) < 5) {
        continue; // Skip plugins with too few requests
      }

      const requests = plugin.requests ?? 0;
      const errorRate = requests > 0
        ? ((plugin.errors ?? 0) / requests) * 100
        : 0;

      const key = `plugin:${plugin.pluginId}`;

      if (this.isInCooldown(key)) {
        continue;
      }

      let severity: IncidentSeverity | null = null;
      let title = '';
      let details = '';

      if (errorRate >= this.config.thresholds.pluginErrorRateCritical) {
        severity = 'critical';
        title = `Plugin Failure: ${plugin.pluginId}`;
        details = `Plugin ${plugin.pluginId} has critical error rate of ${errorRate.toFixed(1)}% ` +
          `(${plugin.errors ?? 0}/${requests} requests). ` +
          `This exceeds the critical threshold of ${this.config.thresholds.pluginErrorRateCritical}%.`;
      } else if (errorRate >= this.config.thresholds.pluginErrorRateWarning) {
        severity = 'warning';
        title = `Plugin Issues: ${plugin.pluginId}`;
        details = `Plugin ${plugin.pluginId} has elevated error rate of ${errorRate.toFixed(1)}% ` +
          `(${plugin.errors ?? 0}/${requests} requests).`;
      }

      if (severity) {
        await this.createIncident({
          type: 'plugin_failure',
          severity,
          title,
          details,
          affectedServices: [plugin.pluginId],
          metadata: {
            pluginId: plugin.pluginId,
            errorRate,
            requests,
            errors: plugin.errors,
            avgLatency: plugin.latency?.average,
          },
        }, key, now);
      }
    }
  }

  /**
   * Check if incident key is in cooldown
   */
  private isInCooldown(key: string): boolean {
    return this.recentIncidents.some(ri => ri.key === key);
  }

  /**
   * Gather related data (logs, metrics, timeline) for incident
   * @private
   */
  private async gatherRelatedData(
    incidentType: IncidentType,
    timeWindow: number = 5 * 60 * 1000 // 5 minutes default
  ): Promise<RelatedData> {
    const now = Date.now();
    const from = now - timeWindow;

    const relatedData: RelatedData = {
      timeline: [],
    };

    try {
      // Gather error and fatal logs from time window
      const [errorLogsResult, fatalLogsResult] = await Promise.all([
        platform.logs.query({ level: 'error' as LogLevel, from, to: now }, { limit: 50 }),
        platform.logs.query({ level: 'fatal' as LogLevel, from, to: now }, { limit: 50 }),
      ]);

      const allErrorLogs = [...errorLogsResult.logs, ...fatalLogsResult.logs];

      if (allErrorLogs.length > 0) {
        // Sort by timestamp descending
        allErrorLogs.sort((a, b) => b.timestamp - a.timestamp);

        // Extract sample error messages with stack traces (top 5 unique)
        const uniqueErrors = new Set<string>();
        const endpointErrorCount = new Map<string, { count: number; sample: string }>();

        for (const log of allErrorLogs) {
          // Extract error message with stack trace if available
          let errorMsg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message);

          // Add structured error info if available
          const fields = log.fields as LogEntryFields;
          if (fields.err) {
            const err = fields.err;
            const stack = err.stack ? `\n${err.stack.split('\n').slice(0, 3).join('\n')}` : '';
            errorMsg = `${err.message || errorMsg}${stack}`;

            // Add plugin/command context if available
            if (fields.plugin) {
              errorMsg = `[${fields.plugin}] ${errorMsg}`;
            }
            if (fields.command) {
              errorMsg += `\nCommand: ${fields.command}`;
            }
          }

          if (errorMsg && uniqueErrors.size < 5) {
            uniqueErrors.add(errorMsg.substring(0, 500)); // Increased limit for stack traces
          }

          // Group errors by endpoint (if available in log metadata)
          const logFields = log.fields as LogEntryFields;
          const endpoint = logFields.endpoint ?? logFields.url ?? 'unknown';
          const existing = endpointErrorCount.get(endpoint);
          if (existing) {
            existing.count++;
          } else {
            endpointErrorCount.set(endpoint, {
              count: 1,
              sample: errorMsg.substring(0, 200)
            });
          }
        }

        // Get top 5 endpoints with most errors
        const topEndpoints = Array.from(endpointErrorCount.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([endpoint, data]) => ({
            endpoint,
            count: data.count,
            sample: data.sample,
          }));

        relatedData.logs = {
          errorCount: allErrorLogs.filter(l => l.level === 'error').length,
          warnCount: 0, // Could query warnings separately if needed
          timeRange: [from, now],
          sampleErrors: Array.from(uniqueErrors),
          topEndpoints: topEndpoints.length > 0 ? topEndpoints : undefined,
        };

        // Add error logs to timeline (top 10 most recent)
        for (const log of allErrorLogs.slice(0, 10)) {
          const msg = typeof log.message === 'string' ? log.message : 'Error occurred';
          const timelineFields = log.fields as LogEntryFields;
          const plugin = timelineFields.plugin ? `[${timelineFields.plugin}] ` : '';
          relatedData.timeline!.push({
            timestamp: log.timestamp,
            event: `${plugin}${msg.substring(0, 100)}`,
            source: 'logs',
          });
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to gather related logs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Add current metrics snapshot (during)
    const currentMetrics = metricsCollector.getMetrics();
    const duringMetrics = {
      errorRate: currentMetrics.requests.total > 0
        ? ((currentMetrics.requests.clientErrors + currentMetrics.requests.serverErrors) / currentMetrics.requests.total) * 100
        : 0,
      avgLatency: currentMetrics.latency.average ?? 0,
      totalRequests: currentMetrics.requests.total,
      totalErrors: currentMetrics.requests.clientErrors + currentMetrics.requests.serverErrors,
    };

    // Calculate "before" metrics from history (average of last 5 snapshots before incident)
    let beforeMetrics: Record<string, number> | undefined;
    if (this.metricsHistory.length >= 2) {
      // Use snapshots before the current one (exclude last snapshot which might be spike)
      const beforeSnapshots = this.metricsHistory.slice(0, -1);

      if (beforeSnapshots.length > 0) {
        const avgErrorRate = beforeSnapshots.reduce((sum, s) => sum + s.errorRate, 0) / beforeSnapshots.length;
        const avgLatency = beforeSnapshots.reduce((sum, s) => sum + s.avgLatency, 0) / beforeSnapshots.length;
        const avgRequests = beforeSnapshots.reduce((sum, s) => sum + s.totalRequests, 0) / beforeSnapshots.length;

        beforeMetrics = {
          errorRate: avgErrorRate,
          avgLatency,
          totalRequests: avgRequests,
        };

        this.log('debug', 'Calculated before metrics', {
          before: beforeMetrics,
          during: duringMetrics,
          snapshotsUsed: beforeSnapshots.length,
        });
      }
    }

    // Collect top slowest requests from metrics histogram (for latency incidents)
    let topSlowest: Array<{ endpoint: string; method: string; durationMs: number; statusCode?: number }> | undefined;
    let affectedEndpoints: string[] | undefined;

    if (incidentType === 'latency_spike') {
      const histogram = currentMetrics.latency.histogram;

      if (histogram && histogram.length > 0) {
        // Sort by max latency descending (slowest first)
        const slowestRoutes = histogram
          .filter(h => h.max > 100) // Only include requests >100ms
          .sort((a, b) => b.max - a.max)
          .slice(0, 10); // Top 10 slowest

        topSlowest = slowestRoutes.map(h => {
          const [method, ...pathParts] = h.route.split(' ');
          const endpoint = pathParts.join(' ');
          // Get most common status code
          const statusCodes = Object.keys(h.byStatus);
          const mostCommonStatus = statusCodes.length > 0 ? parseInt(statusCodes[0]!, 10) : undefined;

          return {
            endpoint,
            method: method || 'GET',
            durationMs: Math.round(h.max),
            statusCode: mostCommonStatus,
          };
        });

        affectedEndpoints = [...new Set(slowestRoutes.map(h => h.route))];

        this.log('debug', 'Collected slow requests for latency incident', {
          topSlowestCount: topSlowest.length,
          affectedEndpointsCount: affectedEndpoints.length,
        });
      }
    }

    relatedData.metrics = {
      before: beforeMetrics,
      during: duringMetrics,
      topSlowest,
      affectedEndpoints,
    };

    // Add detection event to timeline
    relatedData.timeline!.unshift({
      timestamp: now,
      event: `Incident detected: ${incidentType}`,
      source: 'detector',
    });

    // Sort timeline by timestamp descending (newest first)
    relatedData.timeline!.sort((a, b) => b.timestamp - a.timestamp);

    return relatedData;
  }

  /**
   * Create incident and track it
   */
  private async createIncident(
    payload: IncidentCreatePayload,
    key: string,
    timestamp: number
  ): Promise<void> {
    try {
      // Gather related data (logs, metrics, timeline)
      const relatedData = await this.gatherRelatedData(payload.type);

      // Merge with existing payload
      const enrichedPayload: IncidentCreatePayload = {
        ...payload,
        relatedData,
      };

      const incident = await this.incidentStorage.createIncident(enrichedPayload);

      // Track for deduplication
      this.recentIncidents.push({
        type: payload.type,
        key,
        timestamp,
      });

      this.log('info', 'Auto-created incident with context', {
        id: incident.id,
        type: incident.type,
        severity: incident.severity,
        title: incident.title,
        errorLogsCount: relatedData.logs?.errorCount ?? 0,
        timelineEventsCount: relatedData.timeline?.length ?? 0,
      });

      // Track analytics event
      if (platform.analytics) {
        platform.analytics.track('incident.created', {
          incidentId: incident.id,
          type: incident.type,
          severity: incident.severity,
          source: 'auto-detector',
          errorLogsCount: relatedData.logs?.errorCount ?? 0,
          timelineEventsCount: relatedData.timeline?.length ?? 0,
          hasBeforeMetrics: !!relatedData.metrics?.before,
          affectedServicesCount: payload.affectedServices?.length ?? 0,
        }).catch(() => {
          // Silently ignore analytics errors
        });
      }
    } catch (error) {
      this.log('error', 'Failed to create incident', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current detector status
   */
  getStatus(): {
    running: boolean;
    config: IncidentDetectorConfig;
    recentIncidentsCount: number;
  } {
    return {
      running: this.isRunning,
      config: this.config,
      recentIncidentsCount: this.recentIncidents.length,
    };
  }

  /**
   * Update thresholds at runtime
   */
  updateThresholds(thresholds: Partial<DetectionThresholds>): void {
    this.config.thresholds = { ...this.config.thresholds, ...thresholds };
    this.log('info', 'Thresholds updated', { thresholds: this.config.thresholds });
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
    if (level === 'debug' && !this.config.debug) {return;}

    const prefix = '[IncidentDetector]';
    if (this.logger[level]) {
      if (meta) {
        this.logger[level]({ ...meta }, `${prefix} ${message}`);
      } else {
        this.logger[level](`${prefix} ${message}`);
      }
    } else {
      console.log(`${prefix} [${level}] ${message}`, meta ?? '');
    }
  }
}
