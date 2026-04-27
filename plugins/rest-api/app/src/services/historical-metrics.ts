/**
 * @module @kb-labs/rest-api-app/services/historical-metrics
 * Historical metrics collection and storage service
 */

import type { CacheAdapter } from '@kb-labs/plugin-contracts';
import { metricsCollector } from '../middleware/metrics.js';

/**
 * Historical data point
 */
export interface HistoricalDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Heatmap cell data
 */
export interface HeatmapCell {
  day: string; // 'Mon', 'Tue', etc.
  hour: number; // 0-23
  value: number;
}

/**
 * Metrics snapshot for historical storage
 */
interface MetricsSnapshot {
  timestamp: number;
  requests: {
    total: number;
    success: number;
    clientErrors: number;
    serverErrors: number;
  };
  latency: {
    average: number;
    min: number;
    max: number;
    p50?: number;
    p95?: number;
    p99?: number;
  };
  uptime: number; // seconds
  perPlugin: Array<{
    pluginId?: string;
    requests: number;
    errors: number;
    avgLatency: number;
  }>;
}

/**
 * Historical metrics collector configuration
 */
export interface HistoricalMetricsConfig {
  /** Collection interval in milliseconds (default: 5000 = 5s) */
  intervalMs?: number;
  /** Maximum points to store per time range */
  maxPoints?: {
    /** Last 1 minute (default: 12 points at 5s intervals) */
    '1m'?: number;
    /** Last 5 minutes (default: 60 points) */
    '5m'?: number;
    /** Last 10 minutes (default: 120 points) */
    '10m'?: number;
    /** Last 30 minutes (default: 360 points) */
    '30m'?: number;
    /** Last 1 hour (default: 720 points) */
    '1h'?: number;
  };
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<HistoricalMetricsConfig> = {
  intervalMs: 5000,
  maxPoints: {
    '1m': 12,
    '5m': 60,
    '10m': 120,
    '30m': 360,
    '1h': 720,
  },
  debug: false,
};

/**
 * Historical metrics collector service
 *
 * Collects and stores historical metrics data in platform.cache with TTL-based retention.
 * Provides time-series data for dashboards and analytics.
 */
export class HistoricalMetricsCollector {
  private cache: CacheAdapter;
  private config: Required<HistoricalMetricsConfig>;
  private intervalHandle: NodeJS.Timeout | null = null;
  private logger: Console | any;
  private startTimeMs: number = Date.now();

  constructor(cache: CacheAdapter, config: HistoricalMetricsConfig = {}, logger: Console | any = console) {
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config, maxPoints: { ...DEFAULT_CONFIG.maxPoints, ...config.maxPoints } };
    this.logger = logger;
  }

  /**
   * Start background collection
   */
  start(): void {
    if (this.intervalHandle) {
      this.log('warn', 'Historical metrics collector already started');
      return;
    }

    this.log('info', 'Starting historical metrics collector', {
      intervalMs: this.config.intervalMs,
    });

    // Collect immediately, then every intervalMs
    this.collect().catch(err => {
      this.log('error', 'Failed to collect initial metrics', { err });
    });

    this.intervalHandle = setInterval(() => {
      this.collect().catch(err => {
        this.log('error', 'Failed to collect metrics', { err });
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop background collection
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.log('info', 'Historical metrics collector stopped');
    }
  }

  /**
   * Collect current metrics snapshot and store in cache
   */
  private async collect(): Promise<void> {
    const now = Date.now();
    const metrics = metricsCollector.getMetrics();

    // Build snapshot
    const snapshot: MetricsSnapshot = {
      timestamp: now,
      requests: {
        total: metrics.requests.total,
        success: metrics.requests.success ?? 0,
        clientErrors: metrics.requests.clientErrors ?? 0,
        serverErrors: metrics.requests.serverErrors ?? 0,
      },
      latency: {
        average: metrics.latency.average,
        min: metrics.latency.min === Infinity ? 0 : metrics.latency.min,
        max: metrics.latency.max,
      },
      uptime: (now - metrics.timestamps.startTime) / 1000,
      perPlugin: metrics.perPlugin.map(p => ({
        pluginId: p.pluginId,
        requests: p.total,
        errors: Object.values(p.statuses)
          .filter((_, idx) => Object.keys(p.statuses)[idx]?.startsWith('4') || Object.keys(p.statuses)[idx]?.startsWith('5'))
          .reduce((sum, count) => sum + count, 0),
        avgLatency: p.total > 0 ? p.totalDuration / p.total : 0,
      })),
    };

    // Store in each time range bucket
    await Promise.all([
      this.appendToTimeSeries('1m', snapshot, 2 * 60 * 1000), // TTL: 2 minutes
      this.appendToTimeSeries('5m', snapshot, 10 * 60 * 1000), // TTL: 10 minutes
      this.appendToTimeSeries('10m', snapshot, 20 * 60 * 1000), // TTL: 20 minutes
      this.appendToTimeSeries('30m', snapshot, 60 * 60 * 1000), // TTL: 1 hour
      this.appendToTimeSeries('1h', snapshot, 2 * 60 * 60 * 1000), // TTL: 2 hours
    ]);

    // Update heatmap aggregation (less frequently - every minute)
    if (now % 60000 < this.config.intervalMs) {
      await this.updateHeatmapAggregation(snapshot).catch(err => {
        this.log('error', 'Failed to update heatmap', { err });
      });
    }

    this.log('debug', 'Metrics snapshot collected', {
      timestamp: new Date(now).toISOString(),
      requests: snapshot.requests.total,
      latency: snapshot.latency.average.toFixed(2),
    });
  }

  /**
   * Append snapshot to time series bucket
   */
  private async appendToTimeSeries(range: keyof typeof DEFAULT_CONFIG.maxPoints, snapshot: MetricsSnapshot, ttlMs: number): Promise<void> {
    const key = `metrics:history:${range}`;
    const maxPoints = this.config.maxPoints[range] ?? 120;

    // Get existing time series
    let timeSeries = await this.cache.get<MetricsSnapshot[]>(key);
    if (!timeSeries || !Array.isArray(timeSeries)) {
      timeSeries = [];
    }

    // Append new snapshot
    timeSeries.push(snapshot);

    // Trim to max points (FIFO)
    if (timeSeries.length > maxPoints) {
      timeSeries = timeSeries.slice(timeSeries.length - maxPoints);
    }

    // Store back with TTL
    await this.cache.set(key, timeSeries, ttlMs);
  }

  /**
   * Update heatmap aggregation for weekly patterns
   */
  private async updateHeatmapAggregation(snapshot: MetricsSnapshot): Promise<void> {
    const key = 'metrics:heatmap:7d';
    const ttlMs = 24 * 60 * 60 * 1000; // 24 hours

    // Get existing heatmap data
    let heatmapData = await this.cache.get<Record<string, HeatmapCell[]>>(key);
    if (!heatmapData || typeof heatmapData !== 'object') {
      heatmapData = { latency: [], errors: [], requests: [] };
    }

    // Calculate current day and hour
    const date = new Date(snapshot.timestamp);
    const day = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const)[date.getDay() as 0|1|2|3|4|5|6];
    const hour = date.getHours();

    // Update each metric type
    for (const metricType of ['latency', 'errors', 'requests'] as const) {
      let cells = heatmapData[metricType] || [];

      // Find or create cell for this day/hour
      const cellIndex = cells.findIndex(c => c.day === day && c.hour === hour);

      let value = 0;
      if (metricType === 'latency') {
        value = snapshot.latency.average;
      } else if (metricType === 'errors') {
        value = snapshot.requests.clientErrors + snapshot.requests.serverErrors;
      } else {
        value = snapshot.requests.total;
      }

      if (cellIndex >= 0 && cells[cellIndex]) {
        // Update existing cell (exponential moving average)
        cells[cellIndex]!.value = cells[cellIndex]!.value * 0.9 + value * 0.1;
      } else {
        // Add new cell
        cells.push({ day, hour, value });
      }

      // Keep only last 7 days worth of unique day/hour combinations (7 * 24 = 168 cells max)
      if (cells.length > 168) {
        cells = cells.slice(cells.length - 168);
      }

      heatmapData[metricType] = cells;
    }

    // Store back with TTL
    await this.cache.set(key, heatmapData, ttlMs);
  }

  /**
   * Query historical time-series data
   */
  async queryHistory(params: {
    metric: 'requests' | 'errors' | 'latency' | 'uptime';
    range: '1m' | '5m' | '10m' | '30m' | '1h';
    interval?: '5s' | '1m' | '5m';
  }): Promise<HistoricalDataPoint[]> {
    const key = `metrics:history:${params.range}`;

    // Get time series from cache
    const timeSeries = await this.cache.get<MetricsSnapshot[]>(key);
    if (!timeSeries || !Array.isArray(timeSeries)) {
      return [];
    }

    // Extract requested metric
    const dataPoints: HistoricalDataPoint[] = timeSeries.map(snapshot => {
      let value = 0;

      switch (params.metric) {
        case 'requests':
          value = snapshot.requests.total;
          break;
        case 'errors':
          value = snapshot.requests.clientErrors + snapshot.requests.serverErrors;
          break;
        case 'latency':
          value = snapshot.latency.average;
          break;
        case 'uptime':
          value = snapshot.uptime;
          break;
      }

      return {
        timestamp: snapshot.timestamp,
        value,
      };
    });

    // Apply interval aggregation if requested
    if (params.interval && params.interval !== '5s') {
      return this.aggregateByInterval(dataPoints, params.interval);
    }

    return dataPoints;
  }

  /**
   * Query heatmap data
   */
  async queryHeatmap(params: {
    metric: 'latency' | 'errors' | 'requests';
    days?: 7 | 14 | 30;
  }): Promise<HeatmapCell[]> {
    const key = 'metrics:heatmap:7d';

    // Get heatmap data from cache
    const heatmapData = await this.cache.get<Record<string, HeatmapCell[]>>(key);
    if (!heatmapData || typeof heatmapData !== 'object') {
      // Return empty heatmap structure
      return this.generateEmptyHeatmap();
    }

    const cells = heatmapData[params.metric] || [];

    // If no data yet, return empty heatmap
    if (cells.length === 0) {
      return this.generateEmptyHeatmap();
    }

    // Ensure all day/hour combinations exist (fill missing with 0)
    return this.fillHeatmapGaps(cells);
  }

  /**
   * Generate empty heatmap structure (7 days × 24 hours)
   */
  private generateEmptyHeatmap(): HeatmapCell[] {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cells: HeatmapCell[] = [];

    for (const day of days) {
      for (let hour = 0; hour < 24; hour++) {
        cells.push({ day, hour, value: 0 });
      }
    }

    return cells;
  }

  /**
   * Fill gaps in heatmap data (missing day/hour combinations)
   */
  private fillHeatmapGaps(cells: HeatmapCell[]): HeatmapCell[] {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cellMap = new Map<string, number>();

    // Index existing cells
    for (const cell of cells) {
      const key = `${cell.day}:${cell.hour}`;
      cellMap.set(key, cell.value);
    }

    // Generate complete 7×24 grid
    const complete: HeatmapCell[] = [];
    for (const day of days) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}:${hour}`;
        complete.push({
          day,
          hour,
          value: cellMap.get(key) ?? 0,
        });
      }
    }

    return complete;
  }

  /**
   * Aggregate data points by interval
   */
  private aggregateByInterval(dataPoints: HistoricalDataPoint[], interval: '1m' | '5m'): HistoricalDataPoint[] {
    if (dataPoints.length === 0) {return [];}

    const intervalMs = interval === '1m' ? 60 * 1000 : 5 * 60 * 1000;
    const aggregated: HistoricalDataPoint[] = [];

    let bucket: HistoricalDataPoint[] = [];
    let bucketStart = Math.floor(dataPoints[0]!.timestamp / intervalMs) * intervalMs;

    for (const point of dataPoints) {
      const pointBucket = Math.floor(point.timestamp / intervalMs) * intervalMs;

      if (pointBucket === bucketStart) {
        bucket.push(point);
      } else {
        // Finalize current bucket
        if (bucket.length > 0) {
          const avgValue = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;
          aggregated.push({
            timestamp: bucketStart + intervalMs / 2, // midpoint
            value: avgValue,
          });
        }

        // Start new bucket
        bucket = [point];
        bucketStart = pointBucket;
      }
    }

    // Finalize last bucket
    if (bucket.length > 0) {
      const avgValue = bucket.reduce((sum, p) => sum + p.value, 0) / bucket.length;
      aggregated.push({
        timestamp: bucketStart + intervalMs / 2,
        value: avgValue,
      });
    }

    return aggregated;
  }

  /**
   * Get collector statistics
   */
  async getStats(): Promise<{
    running: boolean;
    uptimeSeconds: number;
    timeSeries: Record<string, { points: number; oldestTimestamp: number | null; newestTimestamp: number | null }>;
    heatmap: { cells: number; metrics: string[] };
  }> {
    const stats: {
      running: boolean;
      uptimeSeconds: number;
      timeSeries: Record<string, { points: number; oldestTimestamp: number | null; newestTimestamp: number | null }>;
      heatmap: { cells: number; metrics: string[] };
    } = {
      running: this.intervalHandle !== null,
      uptimeSeconds: (Date.now() - this.startTimeMs) / 1000,
      timeSeries: {},
      heatmap: { cells: 0, metrics: [] },
    };

    // Check each time range
    for (const range of ['1m', '5m', '10m', '30m', '1h'] as const) {
      const key = `metrics:history:${range}`;
      const timeSeries = await this.cache.get<MetricsSnapshot[]>(key);

      if (timeSeries && Array.isArray(timeSeries)) {
        stats.timeSeries[range] = {
          points: timeSeries.length,
          oldestTimestamp: timeSeries[0]?.timestamp ?? null,
          newestTimestamp: timeSeries[timeSeries.length - 1]?.timestamp ?? null,
        };
      } else {
        stats.timeSeries[range] = { points: 0, oldestTimestamp: null, newestTimestamp: null };
      }
    }

    // Check heatmap
    const heatmapData = await this.cache.get<Record<string, HeatmapCell[]>>('metrics:heatmap:7d');
    if (heatmapData && typeof heatmapData === 'object') {
      const metrics = Object.keys(heatmapData);
      const totalCells = metrics.reduce((sum, m) => sum + (heatmapData[m]?.length ?? 0), 0);
      stats.heatmap = { cells: totalCells, metrics };
    }

    return stats;
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
    if (level === 'debug' && !this.config.debug) {return;}

    if (this.logger[level]) {
      this.logger[level](`[HistoricalMetrics] ${message}`, meta);
    } else {
      console.log(`[HistoricalMetrics] [${level}] ${message}`, meta);
    }
  }
}
