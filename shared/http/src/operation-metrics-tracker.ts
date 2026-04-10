import { performance } from 'node:perf_hooks';
import type { ServiceOperationSample } from '@kb-labs/core-contracts';

type StatusStats = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type OperationStats = {
  totalCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  byStatus: Record<OperationStatus, StatusStats>;
};

export type OperationStatus = 'ok' | 'error';

export interface OperationObserver {
  recordOperation(operation: string, durationMs?: number, status?: OperationStatus, count?: number): void;
  observeOperation<T>(operation: string, work: () => T | Promise<T>): Promise<T>;
}

function createEmptyStats(): OperationStats {
  return {
    totalCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    errorCount: 0,
    byStatus: {
      ok: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
      error: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
    },
  };
}

export class OperationMetricsTracker implements OperationObserver {
  private readonly stats = new Map<string, OperationStats>();

  reset(): void {
    this.stats.clear();
  }

  recordOperation(operation: string, durationMs = 0, status: OperationStatus = 'ok', count = 1): void {
    if (typeof operation !== 'string' || operation.length === 0 || !Number.isFinite(count) || count <= 0) {
      return;
    }

    const normalizedDuration = Number.isFinite(durationMs) ? Math.max(durationMs, 0) : 0;
    const entry = this.stats.get(operation) ?? createEmptyStats();
    entry.totalCount += count;
    entry.totalDurationMs += normalizedDuration;
    entry.maxDurationMs = Math.max(entry.maxDurationMs, normalizedDuration);
    entry.byStatus[status].count += count;
    entry.byStatus[status].totalDurationMs += normalizedDuration;
    entry.byStatus[status].maxDurationMs = Math.max(entry.byStatus[status].maxDurationMs, normalizedDuration);
    if (status === 'error') {
      entry.errorCount += count;
    }
    this.stats.set(operation, entry);
  }

  async observeOperation<T>(operation: string, work: () => T | Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await work();
      this.recordOperation(operation, performance.now() - startedAt, 'ok');
      return result;
    } catch (error) {
      this.recordOperation(operation, performance.now() - startedAt, 'error');
      throw error;
    }
  }

  getTopOperations(limit = 5): ServiceOperationSample[] {
    return Array.from(this.stats.entries())
      .sort((a, b) => b[1].totalCount - a[1].totalCount || b[1].maxDurationMs - a[1].maxDurationMs)
      .slice(0, limit)
      .map(([operation, stats]) => ({
        operation,
        count: stats.totalCount,
        avgDurationMs: stats.totalCount > 0 ? stats.totalDurationMs / stats.totalCount : 0,
        maxDurationMs: stats.maxDurationMs,
        errorCount: stats.errorCount,
      }));
  }

  getMetricLines(): string[] {
    const lines: string[] = [];
    for (const [operation, stats] of this.stats.entries()) {
      for (const status of ['ok', 'error'] as const) {
        const statusStats = stats.byStatus[status];
        if (statusStats.count <= 0) {
          continue;
        }
        lines.push(`service_operation_total{operation="${operation}",status="${status}"} ${statusStats.count}`);
        lines.push(
          `service_operation_duration_ms{operation="${operation}",status="${status}"} ${Number(
            statusStats.totalDurationMs.toFixed(2),
          )}`,
        );
      }
    }
    return lines;
  }
}
