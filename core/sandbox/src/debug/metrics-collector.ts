/**
 * @module @kb-labs/core-sandbox/debug/metrics-collector
 * Metrics collection and aggregation for dashboard
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Snapshot data structure (matches @kb-labs/plugin-runtime/snapshot)
 */
interface SnapshotData {
  id: string;
  timestamp: string;
  command: string;
  pluginId: string;
  pluginVersion: string;
  result: 'success' | 'error';
  error?: {
    code: string;
    message: string;
  };
  metrics?: {
    timeMs: number;
    cpuMs?: number;
    memMb?: number;
  };
}

/**
 * Aggregated metrics for a time period
 */
export interface AggregatedMetrics {
  totalRuns: number;
  successRuns: number;
  errorRuns: number;
  successRate: number;
  errorRate: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  avgMemory: number;
  peakMemory: number;
  avgCpuTime: number;
  topErrors: Array<{
    message: string;
    count: number;
    lastOccurrence: string;
  }>;
  trends: {
    duration: 'up' | 'down' | 'stable';
    successRate: 'up' | 'down' | 'stable';
    errorRate: 'up' | 'down' | 'stable';
  };
}

/**
 * Load snapshots from directory
 */
async function loadSnapshots(
  snapshotsDir: string,
  pluginId?: string,
  limit: number = 1000
): Promise<SnapshotData[]> {
  try {
    const files = await fs.readdir(snapshotsDir);
    const snapshotFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const snapshots: SnapshotData[] = [];
    for (const file of snapshotFiles) {
      try {
        const content = await fs.readFile(path.join(snapshotsDir, file), 'utf-8');
        const snapshot = JSON.parse(content) as SnapshotData;
        if (!pluginId || snapshot.pluginId === pluginId) {
          snapshots.push(snapshot);
        }
      } catch {
        // Skip invalid snapshots
      }
    }

    return snapshots;
  } catch {
    return [];
  }
}

/**
 * Calculate percentile
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {return 0;}
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
  const value = sortedValues[safeIndex];
  return value ?? 0;
}

/**
 * Calculate trend
 */
function calculateTrend(
  recent: number[],
  older: number[]
): 'up' | 'down' | 'stable' {
  if (recent.length === 0 || older.length === 0) {return 'stable';}

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = ((recentAvg - olderAvg) / olderAvg) * 100;
  if (Math.abs(diff) < 5) {return 'stable';}
  return diff > 0 ? 'up' : 'down';
}

/**
 * Aggregate metrics from snapshots
 */
export async function aggregateMetrics(
  snapshotsDir: string,
  pluginId?: string,
  timeRange?: { from: Date; to: Date }
): Promise<AggregatedMetrics | null> {
  const snapshots = await loadSnapshots(snapshotsDir, pluginId);

  if (snapshots.length === 0) {
    return null;
  }

  // Filter by time range if provided
  const filteredSnapshots = timeRange
    ? snapshots.filter((s) => {
        const timestamp = new Date(s.timestamp);
        return timestamp >= timeRange.from && timestamp <= timeRange.to;
      })
    : snapshots;

  if (filteredSnapshots.length === 0) {
    return null;
  }

  const totalRuns = filteredSnapshots.length;
  const successRuns = filteredSnapshots.filter((s) => s.result === 'success').length;
  const errorRuns = totalRuns - successRuns;
  const successRate = (successRuns / totalRuns) * 100;
  const errorRate = (errorRuns / totalRuns) * 100;

  // Calculate duration metrics
  const durations = filteredSnapshots
    .map((s) => s.metrics?.timeMs ?? 0)
    .filter((d): d is number => d > 0)
    .sort((a, b) => a - b);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const p50Duration = percentile(durations, 50);
  const p95Duration = percentile(durations, 95);
  const p99Duration = percentile(durations, 99);

  // Calculate memory metrics
  const memories = filteredSnapshots
    .map((s) => s.metrics?.memMb || 0)
    .filter((m) => m > 0);
  const avgMemory = memories.length > 0
    ? memories.reduce((a, b) => a + b, 0) / memories.length
    : 0;
  const peakMemory = memories.length > 0 ? Math.max(...memories) : 0;

  // Calculate CPU metrics
  const cpuTimes = filteredSnapshots
    .map((s) => s.metrics?.cpuMs || 0)
    .filter((c) => c > 0);
  const avgCpuTime = cpuTimes.length > 0
    ? cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length
    : 0;

  // Count top errors
  const errorCounts = new Map<string, { count: number; lastOccurrence: string }>();
  for (const snapshot of filteredSnapshots) {
    if (snapshot.result === 'error' && snapshot.error) {
      const key = snapshot.error.message;
      const existing = errorCounts.get(key);
      if (existing) {
        existing.count++;
        if (snapshot.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = snapshot.timestamp;
        }
      } else {
        errorCounts.set(key, {
          count: 1,
          lastOccurrence: snapshot.timestamp,
        });
      }
    }
  }

  const topErrors = Array.from(errorCounts.entries())
    .map(([message, data]) => ({ message, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate trends (compare first half vs second half)
  const midPoint = Math.floor(filteredSnapshots.length / 2);
  const olderSnapshots = filteredSnapshots.slice(midPoint);
  const recentSnapshots = filteredSnapshots.slice(0, midPoint);

  const olderDurations = olderSnapshots
    .map((s) => s.metrics?.timeMs || 0)
    .filter((d) => d > 0);
  const recentDurations = recentSnapshots
    .map((s) => s.metrics?.timeMs || 0)
    .filter((d) => d > 0);

  const olderSuccessRate =
    olderSnapshots.filter((s) => s.result === 'success').length / olderSnapshots.length;
  const recentSuccessRate =
    recentSnapshots.filter((s) => s.result === 'success').length / recentSnapshots.length;

  const olderErrorRate = 1 - olderSuccessRate;
  const recentErrorRate = 1 - recentSuccessRate;

  return {
    totalRuns,
    successRuns,
    errorRuns,
    successRate,
    errorRate,
    avgDuration,
    p50Duration,
    p95Duration,
    p99Duration,
    avgMemory,
    peakMemory,
    avgCpuTime,
    topErrors,
    trends: {
      duration: calculateTrend(recentDurations, olderDurations),
      successRate: calculateTrend([recentSuccessRate], [olderSuccessRate]),
      errorRate: calculateTrend([recentErrorRate], [olderErrorRate]),
    },
  };
}

/**
 * Format metrics for dashboard display
 */
export function formatMetricsDashboard(
  metrics: AggregatedMetrics,
  pluginId?: string,
  lastRun?: string
): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════════════╗');
  lines.push('║                    KB Labs Metrics Dashboard                   ║');
  lines.push('╠════════════════════════════════════════════════════════════════╣');
  if (pluginId) {
    lines.push(`║ Plugin: ${pluginId.padEnd(56)}║`);
  }
  if (lastRun) {
    lines.push(`║ Last run: ${lastRun.padEnd(52)}║`);
  }
  lines.push('╠════════════════════════════════════════════════════════════════╣');
  lines.push('║ Performance                                                      ║');
  
  const durationTrend = metrics.trends.duration === 'down' ? '▼' : metrics.trends.duration === 'up' ? '▲' : '→';
  const successTrend = metrics.trends.successRate === 'up' ? '▲' : metrics.trends.successRate === 'down' ? '▼' : '→';
  const errorTrend = metrics.trends.errorRate === 'down' ? '▼' : metrics.trends.errorRate === 'up' ? '▲' : '→';

  lines.push(`║ ├─ Avg duration:     ${metrics.avgDuration.toFixed(1)}ms  (trend: ${durationTrend})`);
  lines.push(`║ ├─ P95 duration:     ${metrics.p95Duration.toFixed(1)}ms`);
  lines.push(`║ ├─ Success rate:     ${metrics.successRate.toFixed(1)}% (trend: ${successTrend})`);
  lines.push(`║ └─ Error rate:       ${metrics.errorRate.toFixed(1)}%  (trend: ${errorTrend})`);
  
  lines.push('╠════════════════════════════════════════════════════════════════╣');
  lines.push('║ Resource Usage                                                 ║');
  lines.push(`║ ├─ Peak memory:      ${metrics.peakMemory.toFixed(0)}MB (avg: ${metrics.avgMemory.toFixed(0)}MB)`);
  if (metrics.avgCpuTime > 0) {
    lines.push(`║ ├─ CPU time:         ${metrics.avgCpuTime.toFixed(1)}s`);
  }
  
  lines.push('╠════════════════════════════════════════════════════════════════╣');
  if (metrics.topErrors.length > 0) {
    lines.push('║ Top Errors                                                      ║');
    for (let i = 0; i < Math.min(3, metrics.topErrors.length); i++) {
      const error = metrics.topErrors[i];
      if (!error) {continue;}
      const message = error.message.length > 50
        ? error.message.substring(0, 47) + '...'
        : error.message;
      lines.push(`║ ${i + 1}. ${message.padEnd(54)}║`);
    }
  }
  lines.push('╚════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

