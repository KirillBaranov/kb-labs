/**
 * @module @kb-labs/plugin-execution-factory/backends/worker-pool/pool-lifecycle
 *
 * Worker lifecycle management for worker pool.
 */

import type { WorkerPoolConfig } from './types.js';
import { Worker } from './worker.js';

/**
 * Lifecycle manager for WorkerPool.
 */
export class PoolLifecycleManager {
  private workers: Map<string, Worker>;
  private config: WorkerPoolConfig;
  private workerScript: string;
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // Callbacks
  private onWorkerSpawned: (worker: Worker) => void;
  private onWorkerExited: (worker: Worker, code: number | null) => void;
  private onWorkerRecycled: (worker: Worker) => void;
  private onHealthCheckFailed: (worker: Worker) => void;
  private onProcessQueue: () => void;
  private onWorkersRecycled: () => void;

  constructor(
    workers: Map<string, Worker>,
    config: WorkerPoolConfig,
    workerScript: string,
    callbacks: {
      onWorkerSpawned: (worker: Worker) => void;
      onWorkerExited: (worker: Worker, code: number | null) => void;
      onWorkerRecycled: (worker: Worker) => void;
      onHealthCheckFailed: (worker: Worker) => void;
      onProcessQueue: () => void;
      onWorkersRecycled: () => void;
    }
  ) {
    this.workers = workers;
    this.config = config;
    this.workerScript = workerScript;
    this.onWorkerSpawned = callbacks.onWorkerSpawned;
    this.onWorkerExited = callbacks.onWorkerExited;
    this.onWorkerRecycled = callbacks.onWorkerRecycled;
    this.onHealthCheckFailed = callbacks.onHealthCheckFailed;
    this.onProcessQueue = callbacks.onProcessQueue;
    this.onWorkersRecycled = callbacks.onWorkersRecycled;
  }

  /**
   * Start the pool by spawning minimum workers and starting health checks.
   */
  async start(): Promise<void> {
    const spawnPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.min; i++) {
      spawnPromises.push(this.spawnWorker());
    }

    await Promise.all(spawnPromises);

    // Start health check interval
    this.healthCheckInterval = setInterval(
      () => this.runHealthChecks(),
      this.config.healthCheckIntervalMs
    );
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(timeoutMs = 10_000): Promise<void> {
    this.isShuttingDown = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Shutdown all workers
    const shutdownPromises = Array.from(this.workers.values()).map((worker) =>
      worker.shutdown(timeoutMs)
    );

    await Promise.allSettled(shutdownPromises);
    this.workers.clear();
  }

  /**
   * Spawn a new worker.
   */
  async spawnWorker(): Promise<void> {
    const worker = new Worker({
      workerScript: this.workerScript,
    });

    // Setup event handlers
    worker.on('exit', (w, code, signal) => {
      this.handleWorkerExit(w, code, signal);
    });

    worker.on('healthUpdate', (w, healthy) => {
      if (!healthy) {
        this.onHealthCheckFailed(w);
      }
    });

    this.workers.set(worker.id, worker);

    try {
      await worker.spawn();
      this.onWorkerSpawned(worker);

      // Process queue after worker is ready
      this.onProcessQueue();
    } catch (error) {
      this.workers.delete(worker.id);
      throw error;
    }
  }

  /**
   * Handle worker exit.
   */
  private handleWorkerExit(
    worker: Worker,
    code: number | null,
    _signal: string | null
  ): void {
    this.workers.delete(worker.id);
    this.onWorkerExited(worker, code);

    // Spawn replacement if not shutting down and below min
    if (!this.isShuttingDown && this.workers.size < this.config.min) {
      this.spawnWorker().catch(() => {
        // Log but don't throw
      });
    }

    // Process queue in case worker freed up work
    this.onProcessQueue();
  }

  /**
   * Recycle worker (replace with fresh one).
   */
  async recycleWorker(worker: Worker): Promise<void> {
    this.onWorkersRecycled();
    this.onWorkerRecycled(worker);

    // Gracefully shutdown old worker
    worker.shutdown(5000).catch(() => {});

    // Spawn replacement
    if (!this.isShuttingDown && this.workers.size <= this.config.max) {
      this.spawnWorker().catch(() => {});
    }
  }

  /**
   * Run health checks on all workers.
   */
  private async runHealthChecks(): Promise<void> {
    const workers = Array.from(this.workers.values());

    for (const worker of workers) {
      if (worker.state === 'idle') {
        const healthy = await worker.healthCheck();

        if (!healthy) {
          // Replace unhealthy worker
          this.workers.delete(worker.id);
          worker.kill();

          if (!this.isShuttingDown && this.workers.size < this.config.min) {
            this.spawnWorker().catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Check if worker should be recycled based on limits.
   */
  shouldRecycleWorker(worker: Worker): boolean {
    return worker.shouldRecycle(
      this.config.maxRequestsPerWorker,
      this.config.maxUptimeMsPerWorker
    );
  }

  /**
   * Check if pool is shutting down.
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }
}
