/**
 * @module @kb-labs/core-sandbox/observability/profiling/pre-oom-detector
 * Pre-OOM detection and automatic heap snapshot before crash
 *
 * Monitors heap usage and triggers snapshot when approaching limit
 */

import * as v8 from 'node:v8';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface PreOOMDetectorOptions {
  /** Directory for emergency snapshots */
  snapshotDir?: string;

  /** Check interval (ms) */
  checkInterval?: number;

  /** Threshold percentage (0-1) to trigger snapshot */
  threshold?: number;

  /** Enable/disable */
  enabled?: boolean;

  /** Enable verbose logging (debug mode) */
  verbose?: boolean;
}

export interface OOMWarning {
  timestamp: number;
  heapUsed: number;
  heapLimit: number;
  percentUsed: number;
  estimatedTimeToOOM?: number; // seconds
  snapshotPath?: string;
}

/**
 * PreOOMDetector - detects approaching OOM and captures state
 *
 * Monitors heap usage and automatically creates heap snapshot
 * when memory usage exceeds threshold (default 85%)
 */
export class PreOOMDetector {
  private snapshotDir: string;
  private checkInterval: number;
  private threshold: number;
  private enabled: boolean;
  private verbose: boolean;
  private intervalHandle: NodeJS.Timeout | null = null;
  private snapshotTaken: boolean = false;
  private warnings: OOMWarning[] = [];
  private memoryHistory: Array<{ time: number; heapUsed: number }> = [];

  constructor(options: PreOOMDetectorOptions = {}) {
    this.snapshotDir = options.snapshotDir || '/tmp';
    this.checkInterval = options.checkInterval || 1000; // Check every second
    this.threshold = options.threshold || 0.85; // 85% of limit
    this.enabled = options.enabled ?? true;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (!this.enabled || this.intervalHandle) {
      return;
    }

    if (this.verbose) {
      process.stderr.write('[PreOOMDetector] Started monitoring heap usage\n');
    }

    this.intervalHandle = setInterval(() => {
      this.checkHeapUsage();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Check current heap usage
   */
  private checkHeapUsage(): void {
    try {
      const heapStats = v8.getHeapStatistics();
      const mem = process.memoryUsage();

      const heapUsed = mem.heapUsed;
      const heapLimit = heapStats.heap_size_limit;
      const percentUsed = heapUsed / heapLimit;

      // Track memory history for growth rate calculation
      this.memoryHistory.push({
        time: Date.now(),
        heapUsed,
      });

      // Keep only last 30 measurements
      if (this.memoryHistory.length > 30) {
        this.memoryHistory.shift();
      }

      // Check if approaching limit
      if (percentUsed >= this.threshold && !this.snapshotTaken) {
        this.handlePreOOM(heapUsed, heapLimit, percentUsed);
      }

      // Emergency snapshot at 95%
      if (percentUsed >= 0.95 && !this.snapshotTaken) {
        process.stderr.write('[PreOOMDetector] 🔴 EMERGENCY: 95% heap usage!\n');
        this.handlePreOOM(heapUsed, heapLimit, percentUsed);
      }

    } catch (err) {
      if (this.verbose) {
        process.stderr.write(`[PreOOMDetector] Check failed: ${err}\n`);
      }
    }
  }

  /**
   * Handle pre-OOM condition
   */
  private handlePreOOM(heapUsed: number, heapLimit: number, percentUsed: number): void {
    const timestamp = Date.now();

    // Calculate estimated time to OOM
    const estimatedTime = this.estimateTimeToOOM();

    const warning: OOMWarning = {
      timestamp,
      heapUsed,
      heapLimit,
      percentUsed,
      estimatedTimeToOOM: estimatedTime,
    };

    this.warnings.push(warning);

    // Log warning
    if (this.verbose) {
      const heapMB = (heapUsed / 1024 / 1024).toFixed(0);
      const limitMB = (heapLimit / 1024 / 1024).toFixed(0);
      const percent = (percentUsed * 100).toFixed(1);

      process.stderr.write(
        `[PreOOMDetector] ⚠️  WARNING: ${percent}% heap usage (${heapMB}MB / ${limitMB}MB)\n`
      );

      if (estimatedTime !== undefined && estimatedTime < 60) {
        process.stderr.write(
          `[PreOOMDetector] 🔴 Estimated OOM in ${estimatedTime.toFixed(0)}s\n`
        );
      }
    }

    // Take emergency heap snapshot
    this.takeEmergencySnapshot(warning);
  }

  /**
   * Estimate time to OOM based on growth rate
   */
  private estimateTimeToOOM(): number | undefined {
    if (this.memoryHistory.length < 5) {
      return undefined;
    }

    // Calculate average growth rate
    const recent = this.memoryHistory.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const growth = last!.heapUsed - first!.heapUsed;
    const duration = (last!.time - first!.time) / 1000; // seconds
    const growthRate = growth / duration; // bytes per second

    if (growthRate <= 0) {
      return undefined; // Not growing
    }

    // Calculate remaining heap
    const heapStats = v8.getHeapStatistics();
    const remaining = heapStats.heap_size_limit - last!.heapUsed;

    return remaining / growthRate;
  }

  /**
   * Take emergency heap snapshot
   */
  private takeEmergencySnapshot(warning: OOMWarning): void {
    if (this.snapshotTaken) {
      return; // Already taken
    }

    try {
      const fileName = `heap-pre-oom-${process.pid}-${warning.timestamp}.heapsnapshot`;
      const filePath = path.join(this.snapshotDir, fileName);

      if (this.verbose) {
        process.stderr.write('[PreOOMDetector] Taking emergency heap snapshot...\n');
      }

      const result = v8.writeHeapSnapshot(filePath);
      const stats = fs.statSync(result);

      warning.snapshotPath = result;
      this.snapshotTaken = true;

      if (this.verbose) {
        process.stderr.write(
          `[PreOOMDetector] ✅ Snapshot saved: ${result} (${(stats.size / 1024 / 1024).toFixed(1)}MB)\n`
        );
      }

    } catch (err) {
      if (this.verbose) {
        process.stderr.write(`[PreOOMDetector] ❌ Snapshot failed: ${err}\n`);
      }
    }
  }

  /**
   * Get all warnings
   */
  getWarnings(): OOMWarning[] {
    return [...this.warnings];
  }

  /**
   * Get last warning
   */
  getLastWarning(): OOMWarning | null {
    return this.warnings.length > 0 ? this.warnings[this.warnings.length - 1]! : null;
  }

  /**
   * Check if snapshot was taken
   */
  hasSnapshot(): boolean {
    return this.snapshotTaken;
  }

  /**
   * Get snapshot path
   */
  getSnapshotPath(): string | null {
    const lastWarning = this.getLastWarning();
    return lastWarning?.snapshotPath || null;
  }

  /**
   * Get memory growth summary
   */
  getMemoryGrowthSummary(): {
    totalGrowth: number;
    avgGrowthRate: number;
    duration: number;
  } | null {
    if (this.memoryHistory.length < 2) {
      return null;
    }

    const first = this.memoryHistory[0];
    const last = this.memoryHistory[this.memoryHistory.length - 1];

    const totalGrowth = last!.heapUsed - first!.heapUsed;
    const duration = (last!.time - first!.time) / 1000; // seconds
    const avgGrowthRate = totalGrowth / duration; // bytes per second

    return {
      totalGrowth,
      avgGrowthRate,
      duration,
    };
  }
}

/**
 * Create PreOOMDetector with defaults
 */
export function createPreOOMDetector(options?: Partial<PreOOMDetectorOptions>): PreOOMDetector {
  return new PreOOMDetector(options);
}
