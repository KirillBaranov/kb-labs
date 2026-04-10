/**
 * @module @kb-labs/mind-engine/indexing/memory-monitor
 * Memory monitoring and management for adaptive indexing
 *
 * Tracks memory usage and provides backpressure control to prevent OOM
 */

export interface MemoryStats {
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  heapLimit: number; // bytes
  heapPercent: number; // 0-1
  rss: number; // bytes
  external: number; // bytes
}

export interface MemoryMonitorOptions {
  memoryLimit: number; // bytes
  warningThreshold: number; // 0-1 (e.g., 0.7 = 70%)
  criticalThreshold: number; // 0-1 (e.g., 0.85 = 85%)
  gcEnabled: boolean; // Enable forced garbage collection
}

const DEFAULT_OPTIONS: MemoryMonitorOptions = {
  memoryLimit: 4 * 1024 * 1024 * 1024, // 4GB
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.85, // 85%
  gcEnabled: true,
};

/**
 * Memory Monitor
 * Tracks memory usage and provides backpressure control
 */
export class MemoryMonitor {
  private readonly options: MemoryMonitorOptions;
  private lastGC: number = 0;
  private readonly MIN_GC_INTERVAL = 1000; // Minimum 1s between GC calls

  constructor(options: Partial<MemoryMonitorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapLimit = this.options.memoryLimit;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapLimit,
      heapPercent: memUsage.heapUsed / heapLimit,
      rss: memUsage.rss,
      external: memUsage.external,
    };
  }

  /**
   * Check if memory usage is at warning level
   */
  isWarning(): boolean {
    const stats = this.getStats();
    return stats.heapPercent >= this.options.warningThreshold;
  }

  /**
   * Check if memory usage is at critical level
   */
  isCritical(): boolean {
    const stats = this.getStats();
    return stats.heapPercent >= this.options.criticalThreshold;
  }

  /**
   * Estimate if we can safely allocate given amount of memory
   */
  canAllocate(bytes: number): boolean {
    const stats = this.getStats();
    const afterAllocation = (stats.heapUsed + bytes) / stats.heapLimit;
    return afterAllocation < this.options.criticalThreshold;
  }

  /**
   * Force garbage collection if available and needed
   */
  async forceGC(): Promise<void> {
    if (!this.options.gcEnabled) {
      return;
    }

    const now = Date.now();
    if (now - this.lastGC < this.MIN_GC_INTERVAL) {
      // Don't call GC too frequently
      return;
    }

    if (global.gc) {
      global.gc();
      this.lastGC = now;

      // Allow time for GC to complete
      await this.sleep(50);
    }
  }

  /**
   * Aggressive memory cleanup
   * Calls GC multiple times with delays
   */
  async aggressiveCleanup(): Promise<void> {
    if (!this.options.gcEnabled || !global.gc) {
      return;
    }

    const beforeStats = this.getStats();

    // First GC pass
    global.gc();
    await this.sleep(100);

    // Second GC pass
    global.gc();
    await this.sleep(100);

    const afterStats = this.getStats();
    this.lastGC = Date.now();

    // Log cleanup results
    const freed = beforeStats.heapUsed - afterStats.heapUsed;
    const freedMB = (freed / 1024 / 1024).toFixed(2);

    return;
  }

  /**
   * Apply backpressure based on memory usage
   * Returns delay in milliseconds
   */
  async applyBackpressure(): Promise<number> {
    const stats = this.getStats();

    if (stats.heapPercent >= this.options.criticalThreshold) {
      // Critical level: aggressive cleanup + long delay
      await this.aggressiveCleanup();
      await this.sleep(500);
      return 500;
    } else if (stats.heapPercent >= this.options.warningThreshold) {
      // Warning level: single GC + short delay
      await this.forceGC();
      await this.sleep(100);
      return 100;
    }

    // No backpressure needed
    return 0;
  }

  /**
   * Calculate recommended batch size based on available memory
   */
  recommendBatchSize(
    fileSize: number,
    memoryMultiplier: number,
    maxBatchSize: number,
  ): number {
    const stats = this.getStats();
    const availableMemory = stats.heapLimit * (this.options.warningThreshold - stats.heapPercent);

    // Estimate how many files we can safely process
    const estimatedMemoryPerFile = fileSize * memoryMultiplier;
    const safeBatchSize = Math.floor(availableMemory / estimatedMemoryPerFile);

    // Clamp to reasonable range
    return Math.max(1, Math.min(maxBatchSize, safeBatchSize));
  }

  /**
   * Get formatted memory stats for logging
   */
  getFormattedStats(): {
    heapUsedMB: string;
    heapTotalMB: string;
    heapLimitMB: string;
    heapPercent: string;
    rssMB: string;
  } {
    const stats = this.getStats();
    return {
      heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (stats.heapTotal / 1024 / 1024).toFixed(2),
      heapLimitMB: (stats.heapLimit / 1024 / 1024).toFixed(2),
      heapPercent: (stats.heapPercent * 100).toFixed(1),
      rssMB: (stats.rss / 1024 / 1024).toFixed(2),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => { setTimeout(resolve, ms); });
  }
}
