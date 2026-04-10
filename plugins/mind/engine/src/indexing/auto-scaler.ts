/**
 * Auto-scaler - Dynamic concurrency adjustment based on system resources
 *
 * Automatically scales worker pool concurrency based on:
 * - Available memory (RAM)
 * - Memory pressure
 * - Task throughput
 *
 * Scenarios:
 * - 1GB RAM → 1-2 workers (graceful degradation)
 * - 4GB RAM → 4-8 workers (moderate)
 * - 16GB RAM → 16-32 workers (aggressive)
 * - 32GB+ RAM → 32-64 workers (maximum performance)
 */

import type { MemoryMonitor } from './memory-monitor';
import type { WorkerPool } from './worker-pool';

export interface AutoScalerOptions {
  /**
   * Minimum workers (never scale below this)
   */
  minWorkers: number;

  /**
   * Maximum workers (never scale above this)
   */
  maxWorkers: number;

  /**
   * Memory threshold to trigger scale-down (0-1)
   * Default: 0.8 (80% memory usage)
   */
  scaleDownThreshold?: number;

  /**
   * Memory threshold to trigger scale-up (0-1)
   * Default: 0.5 (50% memory usage)
   */
  scaleUpThreshold?: number;

  /**
   * How often to check and adjust (ms)
   * Default: 1000 (1 second)
   */
  checkInterval?: number;

  /**
   * Enable aggressive scaling (more workers)
   * Default: false
   */
  aggressive?: boolean;
}

export interface AutoScalerStats {
  currentWorkers: number;
  targetWorkers: number;
  memoryUsage: number;
  scaleEvents: number;
  lastScaleDirection: 'up' | 'down' | 'none';
}

/**
 * Auto-scaler for dynamic worker pool adjustment
 */
export class AutoScaler {
  private intervalId: NodeJS.Timeout | null = null;
  private scaleEvents = 0;
  private lastScaleDirection: 'up' | 'down' | 'none' = 'none';
  private targetWorkers: number;

  constructor(
    private readonly memoryMonitor: MemoryMonitor,
    private readonly workerPool: WorkerPool<any, any>,
    private readonly options: AutoScalerOptions
  ) {
    // Calculate initial target based on available RAM
    this.targetWorkers = this.calculateOptimalWorkers();
  }

  /**
   * Start auto-scaling
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    const interval = this.options.checkInterval ?? 1000;
    this.intervalId = setInterval(() => {
      this.adjust();
    }, interval);
  }

  /**
   * Stop auto-scaling
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Manually trigger adjustment
   */
  adjust(): void {
    const memStats = this.memoryMonitor.getStats();
    const poolStats = this.workerPool.getStats();
    const memoryRatio = memStats.heapPercent;

    // Determine scaling direction
    const scaleDownThreshold = this.options.scaleDownThreshold ?? 0.8;
    const scaleUpThreshold = this.options.scaleUpThreshold ?? 0.5;

    if (memoryRatio > scaleDownThreshold) {
      // High memory pressure - scale down
      this.scaleDown(memoryRatio);
    } else if (memoryRatio < scaleUpThreshold && poolStats.queuedTasks > 0) {
      // Low memory pressure + work pending - scale up
      this.scaleUp(memoryRatio);
    }

    // Apply target to worker pool
    this.applyTarget();
  }

  /**
   * Scale down (reduce concurrency)
   */
  private scaleDown(memoryRatio: number): void {
    // Scale down aggressively when memory is high
    const factor = memoryRatio > 0.9 ? 0.5 : 0.75;
    this.targetWorkers = Math.max(
      this.options.minWorkers,
      Math.floor(this.targetWorkers * factor)
    );

    this.lastScaleDirection = 'down';
    this.scaleEvents++;
  }

  /**
   * Scale up (increase concurrency)
   */
  private scaleUp(memoryRatio: number): void {
    // Scale up gradually when memory is low
    const factor = this.options.aggressive ? 1.5 : 1.25;
    this.targetWorkers = Math.min(
      this.options.maxWorkers,
      Math.ceil(this.targetWorkers * factor)
    );

    this.lastScaleDirection = 'up';
    this.scaleEvents++;
  }

  /**
   * Apply target concurrency to worker pool
   */
  private applyTarget(): void {
    const poolStats = this.workerPool.getStats();
    const currentWorkers = poolStats.currentConcurrency;

    if (currentWorkers === this.targetWorkers) {
      return; // No change needed
    }

    // Calculate adjustment factor
    const factor = this.targetWorkers / currentWorkers;
    this.workerPool.adjustConcurrency(factor);
  }

  /**
   * Calculate optimal workers based on available RAM
   */
  private calculateOptimalWorkers(): number {
    const memStats = this.memoryMonitor.getStats();
    const availableGB = memStats.heapLimit / (1024 * 1024 * 1024);

    // Base calculation: 1 worker per GB, up to 4 workers
    // Then 2 workers per additional GB
    let workers: number;

    if (availableGB <= 1) {
      workers = 1; // 1GB → 1 worker
    } else if (availableGB <= 4) {
      workers = Math.floor(availableGB); // 2-4GB → 2-4 workers
    } else if (availableGB <= 16) {
      workers = 4 + Math.floor((availableGB - 4) * 2); // 4-16GB → 4-28 workers
    } else {
      workers = 28 + Math.floor((availableGB - 16) * 1.5); // 16GB+ → 28+ workers
    }

    // Apply aggressive multiplier if enabled
    if (this.options.aggressive) {
      workers = Math.floor(workers * 1.5);
    }

    // Clamp to min/max
    return Math.max(
      this.options.minWorkers,
      Math.min(this.options.maxWorkers, workers)
    );
  }

  /**
   * Get current auto-scaler stats
   */
  getStats(): AutoScalerStats {
    const poolStats = this.workerPool.getStats();
    const memStats = this.memoryMonitor.getStats();

    return {
      currentWorkers: poolStats.currentConcurrency,
      targetWorkers: this.targetWorkers,
      memoryUsage: memStats.heapPercent,
      scaleEvents: this.scaleEvents,
      lastScaleDirection: this.lastScaleDirection,
    };
  }

  /**
   * Get recommended configuration for current system
   */
  getRecommendedConfig(): {
    workers: number;
    batchSize: number;
    description: string;
  } {
    const memStats = this.memoryMonitor.getStats();
    const availableGB = memStats.heapLimit / (1024 * 1024 * 1024);

    if (availableGB < 2) {
      return {
        workers: 1,
        batchSize: 5,
        description: 'Low memory mode (<2GB) - graceful degradation',
      };
    } else if (availableGB < 4) {
      return {
        workers: 2,
        batchSize: 10,
        description: 'Limited memory mode (2-4GB) - conservative',
      };
    } else if (availableGB < 8) {
      return {
        workers: 4,
        batchSize: 20,
        description: 'Standard mode (4-8GB) - balanced',
      };
    } else if (availableGB < 16) {
      return {
        workers: 8,
        batchSize: 30,
        description: 'High memory mode (8-16GB) - aggressive',
      };
    } else {
      return {
        workers: 16,
        batchSize: 50,
        description: 'Maximum mode (16GB+) - maximum performance',
      };
    }
  }
}

/**
 * Create auto-scaler with sensible defaults
 */
export function createAutoScaler(
  memoryMonitor: MemoryMonitor,
  workerPool: WorkerPool<any, any>,
  options: Partial<AutoScalerOptions> = {}
): AutoScaler {
  // Calculate max workers based on CPU cores
  const cpuCount = typeof navigator !== 'undefined'
    ? navigator.hardwareConcurrency ?? 4
    : 4;

  const defaultOptions: AutoScalerOptions = {
    minWorkers: 1,
    maxWorkers: Math.max(4, cpuCount * 2), // 2x CPU cores
    scaleDownThreshold: 0.8,
    scaleUpThreshold: 0.5,
    checkInterval: 1000,
    aggressive: false,
    ...options,
  };

  return new AutoScaler(memoryMonitor, workerPool, defaultOptions);
}
