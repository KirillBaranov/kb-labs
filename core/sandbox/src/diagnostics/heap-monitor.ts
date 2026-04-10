/**
 * @module @kb-labs/core-sandbox/diagnostics/heap-monitor
 * Automatic heap snapshot generation at memory thresholds
 */

import * as v8 from 'node:v8';
import * as path from 'node:path';

export interface HeapMonitorOptions {
  thresholds?: number[]; // Percentages (e.g., [50, 70, 90])
  snapshotDir?: string;
  interval?: number; // Check interval in ms
  verbose?: boolean; // Enable verbose logging
}

export class HeapMonitor {
  private thresholds: Set<number>;
  private snapshotDir: string;
  private interval: number;
  private verbose: boolean;
  private intervalHandle?: NodeJS.Timeout;
  private triggeredThresholds: Set<number> = new Set();

  constructor(options: HeapMonitorOptions = {}) {
    this.thresholds = new Set(options.thresholds || [50, 70, 90]);
    this.snapshotDir = options.snapshotDir || '/tmp';
    this.interval = options.interval || 1000; // Check every second
    this.verbose = options.verbose ?? false;
  }

  /**
   * Start monitoring heap usage
   */
  start(): void {
    this.intervalHandle = setInterval(() => {
      this.checkHeapUsage();
    }, this.interval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  /**
   * Check current heap usage and generate snapshots if thresholds exceeded
   */
  private checkHeapUsage(): void {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const percentUsed = (memUsage.heapUsed / heapStats.heap_size_limit) * 100;

    // Check each threshold
    for (const threshold of this.thresholds) {
      if (percentUsed >= threshold && !this.triggeredThresholds.has(threshold)) {
        this.triggeredThresholds.add(threshold);
        this.generateSnapshot(threshold, percentUsed);
      }
    }
  }

  /**
   * Generate heap snapshot for a threshold
   */
  private generateSnapshot(threshold: number, actualPercent: number): void {
    try {
      const filename = `heap-${threshold}percent-${process.pid}.heapsnapshot`;
      const filepath = path.join(this.snapshotDir, filename);
      const result = v8.writeHeapSnapshot(filepath);

      if (this.verbose) {
        console.warn(
          `[HEAP-MONITOR] ${actualPercent.toFixed(1)}% heap used (threshold: ${threshold}%)`,
        );
        console.warn(`[HEAP-MONITOR] Snapshot saved: ${result}`);
      }
    } catch (err) {
      if (this.verbose) {
        console.error(`[HEAP-MONITOR] Failed to generate snapshot:`, err);
      }
    }
  }

  /**
   * Get current heap usage percentage
   */
  getCurrentUsage(): number {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    return (memUsage.heapUsed / heapStats.heap_size_limit) * 100;
  }

  /**
   * Get heap statistics summary
   */
  getHeapSummary() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(0),
      heapLimitMB: (heapStats.heap_size_limit / 1024 / 1024).toFixed(0),
      percentUsed: ((memUsage.heapUsed / heapStats.heap_size_limit) * 100).toFixed(1),
      rssMB: (memUsage.rss / 1024 / 1024).toFixed(0),
      externalMB: (memUsage.external / 1024 / 1024).toFixed(0),
    };
  }
}
