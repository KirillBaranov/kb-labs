/**
 * WorkerPool - Parallel task execution with concurrency control
 *
 * Manages a pool of concurrent workers to process tasks in parallel.
 * Key features:
 * - Dynamic concurrency adjustment based on memory
 * - Backpressure when queue is full
 * - Error isolation (one task failure doesn't affect others)
 * - Progress tracking
 */

export interface WorkerPoolOptions {
  /**
   * Maximum concurrent workers
   */
  maxConcurrency: number;

  /**
   * Minimum concurrent workers (will never go below this)
   */
  minConcurrency?: number;

  /**
   * Maximum queue size (blocks when full)
   */
  maxQueueSize?: number;

  /**
   * Enable dynamic concurrency adjustment
   */
  dynamicConcurrency?: boolean;
}

export interface WorkerPoolStats {
  activeWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentConcurrency: number;
}

/**
 * Generic worker pool for parallel task processing
 */
export class WorkerPool<TInput, TOutput> {
  private activeWorkers = 0;
  private queue: Array<{
    input: TInput;
    resolve: (output: TOutput) => void;
    reject: (error: Error) => void;
  }> = [];
  private completedTasks = 0;
  private failedTasks = 0;
  private currentConcurrency: number;
  private isShuttingDown = false;

  constructor(
    private readonly worker: (input: TInput) => Promise<TOutput>,
    private readonly options: WorkerPoolOptions
  ) {
    this.currentConcurrency = options.maxConcurrency;
  }

  /**
   * Execute a task in the worker pool
   * Returns a promise that resolves when task completes
   */
  async execute(input: TInput): Promise<TOutput> {
    if (this.isShuttingDown) {
      throw new Error('WorkerPool is shutting down');
    }

    // Apply backpressure if queue is too large
    const maxQueueSize = this.options.maxQueueSize ?? Infinity;
    while (this.queue.length >= maxQueueSize) {
      await this.sleep(100); // Wait for queue to drain
    }

    return new Promise<TOutput>((resolve, reject) => {
      this.queue.push({ input, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel
   * Returns array of results in same order as inputs
   */
  async executeAll(inputs: TInput[]): Promise<TOutput[]> {
    const promises = inputs.map(input => this.execute(input));
    return Promise.all(promises);
  }

  /**
   * Execute tasks with progress callback
   */
  async executeWithProgress(
    inputs: TInput[],
    onProgress: (completed: number, total: number) => void
  ): Promise<TOutput[]> {
    const results: TOutput[] = [];
    let completed = 0;

    for (const input of inputs) {
      const result = await this.execute(input);
      results.push(result);
      completed++;
      onProgress(completed, inputs.length);
    }

    return results;
  }

  /**
   * Adjust concurrency dynamically
   * Call this periodically based on memory pressure
   */
  adjustConcurrency(factor: number): void {
    if (!this.options.dynamicConcurrency) {
      return;
    }

    const minConcurrency = this.options.minConcurrency ?? 1;
    const maxConcurrency = this.options.maxConcurrency;

    // Calculate new concurrency
    const newConcurrency = Math.round(this.currentConcurrency * factor);

    // Clamp to min/max
    this.currentConcurrency = Math.max(
      minConcurrency,
      Math.min(maxConcurrency, newConcurrency)
    );
  }

  /**
   * Get current pool statistics
   */
  getStats(): WorkerPoolStats {
    return {
      activeWorkers: this.activeWorkers,
      queuedTasks: this.queue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      currentConcurrency: this.currentConcurrency,
    };
  }

  /**
   * Wait for all active tasks to complete
   */
  async drain(): Promise<void> {
    while (this.activeWorkers > 0 || this.queue.length > 0) {
      await this.sleep(50);
    }
  }

  /**
   * Shutdown the pool (wait for active tasks, reject queued tasks)
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all queued tasks
    const queuedTasks = this.queue.splice(0);
    for (const task of queuedTasks) {
      task.reject(new Error('WorkerPool is shutting down'));
    }

    // Wait for active tasks to complete
    await this.drain();
  }

  /**
   * Process queued tasks (starts workers up to concurrency limit)
   */
  private processQueue(): void {
    while (
      this.queue.length > 0 &&
      this.activeWorkers < this.currentConcurrency &&
      !this.isShuttingDown
    ) {
      const task = this.queue.shift();
      if (!task) {break;}

      this.activeWorkers++;
      this.processTask(task);
    }
  }

  /**
   * Process a single task
   */
  private async processTask(task: {
    input: TInput;
    resolve: (output: TOutput) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    try {
      const result = await this.worker(task.input);
      task.resolve(result);
      this.completedTasks++;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      task.reject(err);
      this.failedTasks++;
    } finally {
      this.activeWorkers--;
      // Process next task in queue
      this.processQueue();
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => { setTimeout(resolve, ms); });
  }
}

/**
 * Create a worker pool with default options
 */
export function createWorkerPool<TInput, TOutput>(
  worker: (input: TInput) => Promise<TOutput>,
  options: Partial<WorkerPoolOptions> = {}
): WorkerPool<TInput, TOutput> {
  const defaultOptions: WorkerPoolOptions = {
    maxConcurrency: 4,
    minConcurrency: 1,
    maxQueueSize: 100,
    dynamicConcurrency: true,
    ...options,
  };

  return new WorkerPool(worker, defaultOptions);
}
