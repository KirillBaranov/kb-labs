/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/backend
 *
 * WorkerPoolBackend - Level 1 execution with process isolation.
 * Runs handlers in separate Node.js processes for fault isolation.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
  ExecuteOptions,
  HealthStatus,
  ExecutionStats,
  WorkerPoolOptions,
  HostType,
} from '../../types.js';
import type { PlatformServices, UIFacade } from '@kb-labs/plugin-contracts';
import { noopUI } from '@kb-labs/plugin-contracts';
import { WorkerPool } from './pool.js';
import type { WorkerPoolConfig } from './types.js';
import { resolveExecutionTarget } from '../../target-resolver.js';

// When bundled by tsup into dist/index.js, import.meta.url points to dist/index.js.
// worker-script.ts is emitted as a separate entry at dist/backends/worker-pool/worker-script.js.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * WorkerPoolBackend options.
 */
export interface WorkerPoolBackendOptions extends WorkerPoolOptions {
  /** Platform services (passed to worker processes) */
  platform: PlatformServices;

  /** UI provider */
  uiProvider?: (hostType: HostType) => UIFacade;

  /** Custom worker script path (for testing) */
  workerScript?: string;

  /** Maximum queue size (default: 100) */
  maxQueueSize?: number;

  /** Acquire timeout in ms (default: 5000) */
  acquireTimeoutMs?: number;

  /** Health check interval in ms (default: 10000) */
  healthCheckIntervalMs?: number;
}

/**
 * WorkerPoolBackend - executes handlers in worker processes.
 *
 * Features:
 * - Process isolation (crashes don't affect main process)
 * - Bounded queue with QUEUE_FULL error
 * - Acquire timeout with ACQUIRE_TIMEOUT error
 * - Per-plugin concurrency limits
 * - Worker recycling (max requests, max uptime)
 * - Health checks with automatic replacement
 */
export class WorkerPoolBackend implements ExecutionBackend {
  private pool: WorkerPool | null = null;
  private startTime = Date.now();
  private readonly config: WorkerPoolConfig;
  private readonly platform: PlatformServices;
  private readonly uiProvider: (hostType: HostType) => UIFacade;
  private readonly workerScript: string;

  // Aggregate stats (combined from pool stats)
  private totalExecutions = 0;
  private successCount = 0;
  private errorCount = 0;
  private executionTimes: number[] = [];

  constructor(options: WorkerPoolBackendOptions) {
    this.platform = options.platform;
    this.uiProvider = options.uiProvider ?? (() => noopUI);

    // Default worker script (to be created)
    this.workerScript = options.workerScript ??
      path.join(__dirname, 'backends', 'worker-pool', 'worker-script.js');

    this.config = {
      min: options.min ?? 2,
      max: options.max ?? 10,
      maxRequestsPerWorker: options.maxRequestsPerWorker ?? 1000,
      maxUptimeMsPerWorker: options.maxUptimeMsPerWorker ?? 30 * 60 * 1000,
      maxQueueSize: options.maxQueueSize ?? 100,
      acquireTimeoutMs: options.acquireTimeoutMs ?? 5000,
      maxConcurrentPerPlugin: options.maxConcurrentPerPlugin,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 10_000,
      warmup: {
        mode: options.warmup?.mode ?? 'none',
        topN: options.warmup?.topN ?? 5,
        maxHandlers: options.warmup?.maxHandlers ?? 20,
      },
    };
  }

  /**
   * Start the backend - initialize worker pool.
   */
  async start(): Promise<void> {
    if (this.pool) {
      return;
    }

    this.pool = new WorkerPool(this.workerScript, this.config);

    // Log pool events
    this.pool.on('workerSpawned', (worker) => {
      this.platform.logger.debug('Worker spawned', { workerId: worker.id });
    });

    this.pool.on('workerExited', (worker, code) => {
      this.platform.logger.warn('Worker exited', {
        workerId: worker.id,
        exitCode: code,
      });
    });

    this.pool.on('workerRecycled', (worker) => {
      this.platform.logger.debug('Worker recycled', { workerId: worker.id });
    });

    this.pool.on('queueFull', (queueSize) => {
      this.platform.logger.warn('Queue full', { queueSize });
    });

    this.pool.on('healthCheckFailed', (worker) => {
      this.platform.logger.warn('Worker health check failed', {
        workerId: worker.id,
      });
    });

    await this.pool.start();

    this.platform.logger.info('Worker pool started', {
      minWorkers: this.config.min,
      maxWorkers: this.config.max,
    });
  }

  /**
   * Execute handler in worker pool.
   */
  async execute(
    request: ExecutionRequest,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    // Auto-start if not started
    if (!this.pool) {
      await this.start();
    }

    const start = performance.now();
    const requestToExecute = await resolveExecutionTarget(request, this.platform);
    this.totalExecutions++;

    try {
      const result = await this.pool!.execute(requestToExecute, {
        signal: options?.signal,
        onLog: options?.onLog,
      });

      const executionTimeMs = performance.now() - start;

      if (result.ok) {
        this.successCount++;
      } else {
        this.errorCount++;
      }

      // Track execution time
      this.trackExecutionTime(executionTimeMs);

      // Ensure metadata
      result.executionTimeMs = executionTimeMs;
      result.metadata = {
        ...result.metadata,
        backend: 'worker-pool',
        target: requestToExecute.target,
      };

      return result;
    } catch (error) {
      this.errorCount++;
      const executionTimeMs = performance.now() - start;
      this.trackExecutionTime(executionTimeMs);

      return {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'UNKNOWN_ERROR',
        },
        executionTimeMs,
        metadata: {
          backend: 'worker-pool',
          target: requestToExecute.target,
        },
      };
    }
  }

  /**
   * Get health status.
   */
  async health(): Promise<HealthStatus> {
    if (!this.pool) {
      return {
        healthy: false,
        backend: 'worker-pool',
        details: {
          lastError: 'Pool not started',
        },
      };
    }

    const stats = this.pool.getStats();
    const idleWorkers = stats.workersByState.idle;
    const busyWorkers = stats.workersByState.busy;
    const totalWorkers = stats.totalWorkers;

    // Consider unhealthy if no idle workers and queue is building
    const healthy = totalWorkers >= this.config.min &&
      (idleWorkers > 0 || stats.queueLength < this.config.maxQueueSize / 2);

    return {
      healthy,
      backend: 'worker-pool',
      details: {
        workers: {
          total: totalWorkers,
          idle: idleWorkers,
          busy: busyWorkers,
        },
        uptimeMs: Date.now() - this.startTime,
      },
    };
  }

  /**
   * Get execution statistics.
   */
  async stats(): Promise<ExecutionStats> {
    // Calculate percentiles
    let p95: number | undefined;
    let p99: number | undefined;

    if (this.executionTimes.length >= 10) {
      const sorted = [...this.executionTimes].sort((a, b) => a - b);
      p95 = sorted[Math.floor(sorted.length * 0.95)];
      p99 = sorted[Math.floor(sorted.length * 0.99)];
    }

    return {
      totalExecutions: this.totalExecutions,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgExecutionTimeMs: this.executionTimes.length > 0
        ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
        : 0,
      p95ExecutionTimeMs: p95,
      p99ExecutionTimeMs: p99,
    };
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.pool) {
      this.platform.logger.info('Shutting down worker pool');
      await this.pool.shutdown();
      this.pool = null;
    }
  }

  /**
   * Track execution time for statistics.
   */
  private trackExecutionTime(durationMs: number): void {
    this.executionTimes.push(durationMs);

    // Keep last 1000 samples
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }
  }
}
