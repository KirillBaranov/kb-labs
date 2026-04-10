/**
 * @module @kb-labs/plugin-execution-factory/backends/worker-pool/pool-stats
 *
 * Statistics tracking for worker pool.
 */

import type { WorkerPoolStats } from './types.js';
import type { Worker } from './worker.js';

/**
 * Statistics tracker for WorkerPool.
 */
export class PoolStatsTracker {
  stats: WorkerPoolStats = {
    totalWorkers: 0,
    workersByState: {
      starting: 0,
      idle: 0,
      busy: 0,
      draining: 0,
      stopped: 0,
    },
    queueLength: 0,
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    acquireTimeouts: 0,
    queueFullRejections: 0,
    workerCrashes: 0,
    workersRecycled: 0,
    avgQueueWaitMs: 0,
  };

  private queueWaitTimes: number[] = [];
  private pluginConcurrency = new Map<string, number>();

  /**
   * Get current statistics.
   */
  getStats(workers: Map<string, Worker>, queueLength: number): WorkerPoolStats {
    // Update worker state counts
    const workersByState = {
      starting: 0,
      idle: 0,
      busy: 0,
      draining: 0,
      stopped: 0,
    };

    for (const worker of workers.values()) {
      workersByState[worker.state]++;
    }

    return {
      ...this.stats,
      totalWorkers: workers.size,
      workersByState,
      queueLength,
    };
  }

  /**
   * Track queue wait time for statistics.
   */
  trackQueueWaitTime(waitTimeMs: number): void {
    this.queueWaitTimes.push(waitTimeMs);

    // Keep last 1000 samples
    if (this.queueWaitTimes.length > 1000) {
      this.queueWaitTimes.shift();
    }

    // Calculate average
    const sum = this.queueWaitTimes.reduce((a, b) => a + b, 0);
    this.stats.avgQueueWaitMs = sum / this.queueWaitTimes.length;

    // Calculate P99
    if (this.queueWaitTimes.length >= 10) {
      const sorted = [...this.queueWaitTimes].sort((a, b) => a - b);
      this.stats.p99QueueWaitMs = sorted[Math.floor(sorted.length * 0.99)];
    }
  }

  /**
   * Increment plugin concurrency counter.
   */
  incrementPluginConcurrency(pluginId: string): void {
    const current = this.pluginConcurrency.get(pluginId) ?? 0;
    this.pluginConcurrency.set(pluginId, current + 1);
  }

  /**
   * Decrement plugin concurrency counter.
   */
  decrementPluginConcurrency(pluginId: string): void {
    const current = this.pluginConcurrency.get(pluginId) ?? 1;
    this.pluginConcurrency.set(pluginId, Math.max(0, current - 1));
  }

  /**
   * Get current plugin concurrency.
   */
  getPluginConcurrency(pluginId: string): number {
    return this.pluginConcurrency.get(pluginId) ?? 0;
  }
}
