/**
 * @module @kb-labs/rest-api-contracts/observability
 * Observability contracts for system monitoring endpoints
 */

/**
 * Statistics from State Broker daemon
 *
 * Provides metrics about in-memory cache performance, namespace usage,
 * and multi-tenancy statistics.
 */
export interface StateBrokerStats {
  /** Daemon uptime in milliseconds */
  uptime: number;

  /** Total number of cache entries across all namespaces */
  totalEntries: number;

  /** Total cache size in bytes (estimated) */
  totalSize: number;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Cache miss rate (0-1) */
  missRate: number;

  /** Number of evicted entries */
  evictions: number;

  /** Stats per namespace (mind, workflow, etc.) */
  namespaces: Record<string, NamespaceStats>;

  /** Stats per tenant (multi-tenancy support) */
  byTenant?: Record<string, TenantStats>;
}

/**
 * Statistics for a specific namespace
 */
export interface NamespaceStats {
  /** Number of entries in this namespace */
  entries: number;

  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Estimated size in bytes */
  size: number;
}

/**
 * Statistics for a specific tenant
 */
export interface TenantStats {
  /** Number of entries for this tenant */
  entries: number;

  /** Total operations performed */
  operations: number;
}

/**
 * DevKit health check results
 *
 * Provides monorepo health metrics including health score, issues breakdown,
 * and type coverage statistics.
 */
export interface DevKitHealthSnapshot {
  /** Health score (0-100) */
  healthScore: number;

  /** Letter grade (A-F) based on health score */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  /** Breakdown of issues affecting health score */
  issues: {
    /** Number of duplicate dependencies */
    duplicateDeps?: number;

    /** Number of packages missing README files */
    missingReadmes?: number;

    /** Number of TypeScript type errors */
    typeErrors?: number;

    /** Number of broken imports */
    brokenImports?: number;

    /** Number of unused exports */
    unusedExports?: number;

    /** Other issues (custom keys) */
    [key: string]: number | undefined;
  };

  /** Total number of packages in monorepo */
  packages: number;

  /** Average TypeScript type coverage (0-100) */
  avgTypeCoverage?: number;

  /** Number of packages with poor type coverage (<70%) */
  poorTypeCoverageCount?: number;
}

/**
 * Response payload for GET /api/v1/observability/state-broker
 */
export interface StateBrokerStatsPayload {
  ok: true;
  data: StateBrokerStats;
  meta: {
    source: 'state-broker';
    daemonUrl: string;
  };
}

/**
 * Response payload for GET /api/v1/observability/devkit
 */
export interface DevKitHealthPayload {
  ok: true;
  data: DevKitHealthSnapshot;
  meta: {
    source: 'devkit-cli';
    repoRoot: string;
    command: string;
  };
}

/**
 * Historical data point
 */
export interface HistoricalDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Metric value */
  value: number;
}

/**
 * Heatmap cell data (7 days × 24 hours)
 */
export interface HeatmapCell {
  /** Day of week: 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' */
  day: string;
  /** Hour of day: 0-23 */
  hour: number;
  /** Aggregated metric value */
  value: number;
}

/**
 * Response payload for GET /api/v1/observability/metrics/history
 */
export interface MetricsHistoryPayload {
  ok: true;
  data: HistoricalDataPoint[];
  meta: {
    source: 'historical-metrics-collector';
    metric: 'requests' | 'errors' | 'latency' | 'uptime';
    range: '1m' | '5m' | '10m' | '30m' | '1h';
    interval: '5s' | '1m' | '5m';
    points: number;
  };
}

/**
 * Response payload for GET /api/v1/observability/metrics/heatmap
 */
export interface MetricsHeatmapPayload {
  ok: true;
  data: HeatmapCell[];
  meta: {
    source: 'historical-metrics-collector';
    metric: 'latency' | 'errors' | 'requests';
    days: 7 | 14 | 30;
    cells: number;
  };
}
