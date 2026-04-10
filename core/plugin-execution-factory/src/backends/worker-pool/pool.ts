/**
 * @module @kb-labs/plugin-execution-factory/backends/worker-pool/pool
 *
 * WorkerPool - manages pool of workers with bounded queue.
 * Refactored to use modular components for lifecycle, queue, execution, and stats.
 */

import { EventEmitter } from 'node:events';
import type { WorkerPoolConfig } from './types.js';
import type { Worker } from './worker.js';
import type { ExecutionRequest, ExecutionResult } from '../../types.js';
import { QueueFullError } from '../../errors.js';
import { normalizeError } from '../../utils.js';

// Modular components
import { PoolStatsTracker } from './pool-stats.js';
import { PoolLifecycleManager } from './pool-lifecycle.js';
import { PoolQueueManager } from './pool-queue.js';
import { PoolExecutor } from './pool-executor.js';

/**
 * Pool events.
 */
export interface PoolEvents {
  workerSpawned: [worker: Worker];
  workerExited: [worker: Worker, code: number | null];
  workerRecycled: [worker: Worker];
  queueFull: [queueSize: number];
  healthCheckFailed: [worker: Worker];
}

/**
 * WorkerPool - manages a pool of worker processes.
 *
 * Features:
 * - Bounded queue with QUEUE_FULL error when at capacity
 * - Acquire timeout for getting available worker
 * - Per-plugin concurrency limits
 * - Worker recycling (max requests, max uptime)
 * - Health checks with automatic worker replacement
 * - Graceful shutdown
 */
export class WorkerPool extends EventEmitter<PoolEvents> {
  private readonly config: WorkerPoolConfig;
  private readonly workers = new Map<string, Worker>();

  // Modular managers
  private readonly statsTracker: PoolStatsTracker;
  private readonly lifecycleManager: PoolLifecycleManager;
  private readonly queueManager: PoolQueueManager;
  private readonly executor: PoolExecutor;

  constructor(
    workerScript: string,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    super();

    this.config = {
      min: config.min ?? 2,
      max: config.max ?? 10,
      maxRequestsPerWorker: config.maxRequestsPerWorker ?? 1000,
      maxUptimeMsPerWorker: config.maxUptimeMsPerWorker ?? 30 * 60 * 1000,
      maxQueueSize: config.maxQueueSize ?? 100,
      acquireTimeoutMs: config.acquireTimeoutMs ?? 5000,
      maxConcurrentPerPlugin: config.maxConcurrentPerPlugin,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 10_000,
      warmup: config.warmup ?? {
        mode: 'none',
        topN: 5,
        maxHandlers: 20,
      },
    };

    // Initialize stats tracker
    this.statsTracker = new PoolStatsTracker();

    // Initialize lifecycle manager
    this.lifecycleManager = new PoolLifecycleManager(
      this.workers,
      this.config,
      workerScript,
      {
        onWorkerSpawned: (worker) => this.emit('workerSpawned', worker),
        onWorkerExited: (worker, code) => this.emit('workerExited', worker, code),
        onWorkerRecycled: (worker) => this.emit('workerRecycled', worker),
        onHealthCheckFailed: (worker) => this.emit('healthCheckFailed', worker),
        onProcessQueue: () => this.queueManager.processQueue(),
        onWorkersRecycled: () => {
          this.statsTracker.stats.workersRecycled++;
        },
      }
    );

    // Initialize queue manager
    this.queueManager = new PoolQueueManager(this.config, {
      onTrackQueueWaitTime: (waitTimeMs) =>
        this.statsTracker.trackQueueWaitTime(waitTimeMs),
      onGetAvailableWorker: () => this.executor.getAvailableWorker(),
      onExecuteOnWorker: (worker, request, timeoutMs, startTime) =>
        this.executor.executeOnWorker(worker, request, timeoutMs, startTime),
      onAcquireTimeout: () => {
        this.statsTracker.stats.acquireTimeouts++;
      },
    });

    // Initialize executor
    this.executor = new PoolExecutor(this.workers, this.config, {
      onTotalRequests: () => {
        this.statsTracker.stats.totalRequests++;
      },
      onSuccessCount: () => {
        this.statsTracker.stats.successCount++;
      },
      onErrorCount: () => {
        this.statsTracker.stats.errorCount++;
      },
      onWorkerCrash: () => {
        this.statsTracker.stats.workerCrashes++;
      },
      onQueueFullRejection: () => {
        this.statsTracker.stats.queueFullRejections++;
      },
      onRecycleWorker: (worker) => this.lifecycleManager.recycleWorker(worker),
    });
  }

  /**
   * Start the pool.
   */
  async start(): Promise<void> {
    await this.lifecycleManager.start();
  }

  /**
   * Execute request using pool.
   *
   * Flow:
   * 1. Check per-plugin concurrency
   * 2. Check queue capacity
   * 3. Try to get available worker
   * 4. If no worker, queue request
   * 5. Wait for result or timeout
   */
  async execute(
    request: ExecutionRequest,
    options?: { signal?: AbortSignal; onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void }
  ): Promise<ExecutionResult> {
    if (this.lifecycleManager.isShuttingDownState()) {
      return {
        ok: false,
        error: { message: 'Pool is shutting down', code: 'ABORTED' },
        executionTimeMs: 0,
      };
    }

    const pluginId = request.descriptor.pluginId;
    const timeoutMs = request.timeoutMs ?? 30_000;
    const startTime = performance.now();

    // Check per-plugin concurrency
    if (this.config.maxConcurrentPerPlugin) {
      const current = this.statsTracker.getPluginConcurrency(pluginId);
      if (current >= this.config.maxConcurrentPerPlugin) {
        this.statsTracker.stats.queueFullRejections++;
        return {
          ok: false,
          error: normalizeError(
            new QueueFullError(current, this.config.maxConcurrentPerPlugin)
          ),
          executionTimeMs: performance.now() - startTime,
        };
      }
    }

    // Check abort signal
    if (options?.signal?.aborted) {
      return {
        ok: false,
        error: { message: 'Request aborted', code: 'ABORTED' },
        executionTimeMs: performance.now() - startTime,
      };
    }

    // Increment plugin concurrency
    this.statsTracker.incrementPluginConcurrency(pluginId);

    try {
      // Try to get available worker immediately
      const worker = this.executor.getAvailableWorker();

      if (worker) {
        return await this.executor.executeOnWorker(
          worker,
          request,
          timeoutMs,
          startTime,
          options?.onLog,
        );
      }

      // Check queue capacity
      if (this.queueManager.getQueueLength() >= this.config.maxQueueSize) {
        this.statsTracker.stats.queueFullRejections++;
        this.emit('queueFull', this.queueManager.getQueueLength());
        return {
          ok: false,
          error: normalizeError(
            new QueueFullError(
              this.queueManager.getQueueLength(),
              this.config.maxQueueSize
            )
          ),
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Scale up if possible
      if (this.workers.size < this.config.max) {
        this.lifecycleManager.spawnWorker().catch(() => {
          // Ignore spawn errors during scaling
        });
      }

      // Queue the request
      return await this.queueManager.queueRequest(
        request,
        options?.signal,
        timeoutMs,
        startTime
      );
    } finally {
      this.statsTracker.decrementPluginConcurrency(pluginId);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats() {
    return this.statsTracker.getStats(
      this.workers,
      this.queueManager.getQueueLength()
    );
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(timeoutMs = 10_000): Promise<void> {
    // Reject all queued requests
    this.queueManager.clearQueue(new Error('Pool shutdown'));

    // Shutdown all workers
    await this.lifecycleManager.shutdown(timeoutMs);
  }
}
