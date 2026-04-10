/**
 * @module @kb-labs/mind-engine/indexing/memory-aware-queue
 * Memory-aware task queue with adaptive concurrency
 *
 * NO MAGIC NUMBERS - purely memory-based decision making:
 * - Estimates memory for each task
 * - Checks current heap usage
 * - Takes task ONLY if: currentHeap + estimatedMemory < safeThreshold
 * - Dynamically adjusts concurrency from 1 to MAX based on available memory
 */

import * as v8 from 'node:v8';

export interface MemoryAwareQueueOptions<T> {
  /**
   * Function to estimate memory usage for a task (in bytes)
   */
  estimateMemory: (task: T) => number;

  /**
   * Worker function to execute the task
   */
  worker: (task: T) => Promise<any>;

  /**
   * Safe memory threshold (0-1, default 0.7 = 70% of heap limit)
   * When heap usage exceeds this, we stop taking new tasks
   */
  safeThreshold?: number;

  /**
   * Minimum concurrency (will always try to have at least this many tasks running)
   */
  minConcurrency?: number;

  /**
   * Memory reserve (in bytes) to always keep free
   * Default: 512MB
   */
  memoryReserve?: number;

  /**
   * Check interval (ms) for memory availability
   * Default: 100ms
   */
  checkInterval?: number;
}

export interface MemoryAwareQueueStats {
  /**
   * Current number of active tasks
   */
  activeTasks: number;

  /**
   * Number of tasks waiting in queue
   */
  queuedTasks: number;

  /**
   * Total tasks completed
   */
  completedTasks: number;

  /**
   * Total tasks failed
   */
  failedTasks: number;

  /**
   * Current heap usage (bytes)
   */
  heapUsed: number;

  /**
   * Heap limit (bytes)
   */
  heapLimit: number;

  /**
   * Percentage of heap used (0-1)
   */
  heapUsagePercent: number;

  /**
   * Estimated memory in use by active tasks (bytes)
   */
  estimatedActiveMemory: number;
}

interface QueuedTask<T> {
  task: T;
  estimatedMemory: number;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

/**
 * Memory-Aware Queue
 *
 * Dynamically controls concurrency based on REAL memory usage.
 * No magic numbers - decisions based purely on:
 * 1. Current heap usage (from V8)
 * 2. Estimated memory for next task
 * 3. Safe threshold
 *
 * Algorithm:
 * - Before taking task: check if (currentHeap + estimatedMemory + reserve) < (heapLimit * safeThreshold)
 * - If yes: take task, increment concurrency
 * - If no: wait until memory frees up
 * - Concurrency naturally adapts: more memory = more parallel tasks, less memory = fewer tasks
 */
export class MemoryAwareQueue<T> {
  private queue: QueuedTask<T>[] = [];
  private activeTasks = new Map<Promise<any>, number>(); // task → estimatedMemory
  private completedTasks = 0;
  private failedTasks = 0;
  private isShuttingDown = false;
  private processingLoop: Promise<void> | null = null;

  private readonly safeThreshold: number;
  private readonly minConcurrency: number;
  private readonly memoryReserve: number;
  private readonly checkInterval: number;

  constructor(private options: MemoryAwareQueueOptions<T>) {
    this.safeThreshold = options.safeThreshold ?? 0.7; // 70% by default
    this.minConcurrency = options.minConcurrency ?? 1;
    this.memoryReserve = options.memoryReserve ?? 512 * 1024 * 1024; // 512MB
    this.checkInterval = options.checkInterval ?? 100; // 100ms
  }

  /**
   * Start processing queue
   */
  start(): void {
    if (this.processingLoop) {
      return; // Already started
    }

    this.processingLoop = this.runProcessingLoop();
  }

  /**
   * Add task to queue
   */
  async enqueue(task: T): Promise<any> {
    if (this.isShuttingDown) {
      throw new Error('Queue is shutting down');
    }

    // Estimate memory for this task
    const estimatedMemory = this.options.estimateMemory(task);

    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        estimatedMemory,
        resolve,
        reject,
      });
    });
  }

  /**
   * Main processing loop
   * Continuously checks memory and takes tasks when safe
   */
  private async runProcessingLoop(): Promise<void> {
    while (!this.isShuttingDown || this.queue.length > 0 || this.activeTasks.size > 0) {
      // Try to take next task if memory allows
      await this.tryProcessNextTask();

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  /**
   * Try to process next task if memory allows
   */
  private async tryProcessNextTask(): Promise<void> {
    if (this.queue.length === 0) {
      return; // Nothing to do
    }

    // Always process at least minConcurrency tasks
    if (this.activeTasks.size < this.minConcurrency) {
      await this.processTask(this.queue.shift()!);
      return;
    }

    // Get current memory stats
    const heapStats = v8.getHeapStatistics();
    const mem = process.memoryUsage();

    const currentHeap = mem.heapUsed;
    const heapLimit = heapStats.heap_size_limit;
    const safeLimit = heapLimit * this.safeThreshold;

    // Calculate estimated memory for active tasks
    const activeMemory = Array.from(this.activeTasks.values()).reduce((sum, mem) => sum + mem, 0);

    // Get next task
    const nextTask = this.queue[0];
    if (!nextTask) {
      return;
    }

    // Check if we can take this task
    const projectedHeap = currentHeap + nextTask.estimatedMemory;
    const projectedWithReserve = projectedHeap + this.memoryReserve;

    if (projectedWithReserve < safeLimit) {
      // Safe to take task!
      const queuedTask = this.queue.shift()!;
      await this.processTask(queuedTask);
    } else {
      // Not safe - log and wait
      const heapUsagePercent = (currentHeap / heapLimit * 100).toFixed(1);
      const neededMB = (nextTask.estimatedMemory / 1024 / 1024).toFixed(1);
      const availableMB = ((safeLimit - projectedHeap) / 1024 / 1024).toFixed(1);

      process.stderr.write(
        `[MemoryAwareQueue] Waiting for memory: ` +
        `heap=${heapUsagePercent}%, need=${neededMB}MB, available=${availableMB}MB, ` +
        `active=${this.activeTasks.size}, queued=${this.queue.length}\n`
      );

      // Force GC if available to free up memory
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Process a single task
   */
  private async processTask(queuedTask: QueuedTask<T>): Promise<void> {
    const { task, estimatedMemory, resolve, reject } = queuedTask;

    // Create task promise
    const taskPromise = this.options.worker(task)
      .then((result) => {
        this.activeTasks.delete(taskPromise);
        this.completedTasks++;
        resolve(result);
      })
      .catch((error) => {
        this.activeTasks.delete(taskPromise);
        this.failedTasks++;
        reject(error);
      });

    // Track active task
    this.activeTasks.set(taskPromise, estimatedMemory);
  }

  /**
   * Get current queue statistics
   */
  getStats(): MemoryAwareQueueStats {
    const heapStats = v8.getHeapStatistics();
    const mem = process.memoryUsage();

    const estimatedActiveMemory = Array.from(this.activeTasks.values()).reduce((sum, mem) => sum + mem, 0);

    return {
      activeTasks: this.activeTasks.size,
      queuedTasks: this.queue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      heapUsed: mem.heapUsed,
      heapLimit: heapStats.heap_size_limit,
      heapUsagePercent: mem.heapUsed / heapStats.heap_size_limit,
      estimatedActiveMemory,
    };
  }

  /**
   * Shutdown queue and wait for active tasks to complete
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Wait for all active tasks
    await Promise.all(Array.from(this.activeTasks.keys()));

    // Wait for processing loop to finish
    if (this.processingLoop) {
      await this.processingLoop;
    }
  }

  /**
   * Helper: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => { setTimeout(resolve, ms); });
  }
}

/**
 * Create memory-aware queue
 */
export function createMemoryAwareQueue<T>(
  options: MemoryAwareQueueOptions<T>
): MemoryAwareQueue<T> {
  return new MemoryAwareQueue(options);
}
