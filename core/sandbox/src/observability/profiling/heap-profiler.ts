/**
 * @module @kb-labs/core-sandbox/observability/profiling/heap-profiler
 * Continuous heap profiling with automatic snapshots and diff analysis
 */

import * as v8 from 'node:v8';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface HeapProfilerOptions {
  /** Directory for snapshots */
  snapshotDir?: string;

  /** Interval between snapshots (ms) */
  interval?: number;

  /** Max snapshots to keep */
  maxSnapshots?: number;

  /** Enable/disable */
  enabled?: boolean;
}

/**
 * Heap snapshot metadata
 */
export interface HeapSnapshotInfo {
  timestamp: number;
  filePath: string;
  size: number;
  heapUsed: number;
  heapTotal: number;
}

/**
 * HeapProfiler - continuous heap snapshot collector
 *
 * Takes heap snapshots at regular intervals and analyzes memory growth
 */
export class HeapProfiler {
  private snapshotDir: string;
  private interval: number;
  private maxSnapshots: number;
  private enabled: boolean;
  private intervalHandle: NodeJS.Timeout | null = null;
  private snapshots: HeapSnapshotInfo[] = [];
  private snapshotCount: number = 0;

  constructor(options: HeapProfilerOptions = {}) {
    this.snapshotDir = options.snapshotDir || '/tmp';
    this.interval = options.interval || 5000; // 5 seconds
    this.maxSnapshots = options.maxSnapshots || 10;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Start continuous profiling
   */
  start(): void {
    if (!this.enabled || this.intervalHandle) {
      return;
    }

    // Take initial snapshot
    this.takeSnapshot();

    // Schedule periodic snapshots
    this.intervalHandle = setInterval(() => {
      this.takeSnapshot();
    }, this.interval);
  }

  /**
   * Stop profiling
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Take heap snapshot
   */
  private takeSnapshot(): void {
    try {
      const timestamp = Date.now();
      const mem = process.memoryUsage();

      // Generate filename
      const fileName = `heap-${process.pid}-${this.snapshotCount}-${timestamp}.heapsnapshot`;
      const filePath = path.join(this.snapshotDir, fileName);

      // Write snapshot
      const result = v8.writeHeapSnapshot(filePath);

      // Get file size
      const stats = fs.statSync(result);

      // Store metadata
      const info: HeapSnapshotInfo = {
        timestamp,
        filePath: result,
        size: stats.size,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      };

      this.snapshots.push(info);
      this.snapshotCount++;

      // Cleanup old snapshots
      if (this.snapshots.length > this.maxSnapshots) {
        const old = this.snapshots.shift();
        if (old) {
          try {
            fs.unlinkSync(old.filePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      // Log snapshot
      process.stderr.write(
        `[HeapProfiler] Snapshot ${this.snapshotCount}: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB → ${result}\n`
      );

      // Detect memory leak
      this.detectMemoryLeak();

    } catch (err) {
      process.stderr.write(`[HeapProfiler] Snapshot failed: ${err}\n`);
    }
  }

  /**
   * Detect memory leak
   */
  private detectMemoryLeak(): void {
    if (this.snapshots.length < 3) {
      return; // Need at least 3 snapshots
    }

    // Get last 3 snapshots
    const recent = this.snapshots.slice(-3);

    // Calculate growth rate
    const growth1 = recent[1]!.heapUsed - recent[0]!.heapUsed;
    const growth2 = recent[2]!.heapUsed - recent[1]!.heapUsed;

    // Detect consistent growth
    const avgGrowth = (growth1 + growth2) / 2;
    const growthRate = avgGrowth / (this.interval / 1000); // bytes per second

    if (growthRate > 10 * 1024 * 1024) { // >10MB/s
      const growthMBps = (growthRate / 1024 / 1024).toFixed(1);
      process.stderr.write(
        `[HeapProfiler] ⚠️  Memory leak detected: +${growthMBps}MB/s\n`
      );

      // Estimate time to OOM
      const heapLimit = v8.getHeapStatistics().heap_size_limit;
      const currentHeap = recent[2]!.heapUsed;
      const remaining = heapLimit - currentHeap;
      const timeToOOM = remaining / growthRate;

      if (timeToOOM < 60) { // Less than 60 seconds
        process.stderr.write(
          `[HeapProfiler] 🔴 OOM in ${timeToOOM.toFixed(0)}s!\n`
        );
      }
    }
  }

  /**
   * Get snapshot history
   */
  getSnapshots(): HeapSnapshotInfo[] {
    return [...this.snapshots];
  }

  /**
   * Get memory growth summary
   */
  getGrowthSummary(): {
    totalGrowth: number;
    avgGrowthRate: number;
    snapshotCount: number;
  } | null {
    if (this.snapshots.length < 2) {
      return null;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const totalGrowth = last!.heapUsed - first!.heapUsed;
    const duration = (last!.timestamp - first!.timestamp) / 1000; // seconds
    const avgGrowthRate = totalGrowth / duration; // bytes per second

    return {
      totalGrowth,
      avgGrowthRate,
      snapshotCount: this.snapshots.length,
    };
  }

  /**
   * Cleanup on exit
   */
  async cleanup(): Promise<void> {
    this.stop();

    // Optionally cleanup snapshots
    // (We keep them for post-mortem analysis by default)
  }
}

/**
 * Create HeapProfiler with defaults
 */
export function createHeapProfiler(options?: Partial<HeapProfilerOptions>): HeapProfiler {
  return new HeapProfiler(options);
}
