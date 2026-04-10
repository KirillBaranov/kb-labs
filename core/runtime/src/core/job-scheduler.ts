/**
 * @module @kb-labs/core-runtime/core/job-scheduler
 * In-memory job scheduler with queue and execution.
 */

import type {
  IJobScheduler,
  JobDefinition,
  JobHandle,
  JobFilter,
  CronExpression,
  IResourceManager,
  IEventBus,
  ILogger,
} from '@kb-labs/core-platform';

export interface JobSchedulerConfig {
  /** Maximum concurrent jobs globally (default: 10) */
  maxConcurrent?: number;
  /** Queue poll interval in ms (default: 1000) */
  pollInterval?: number;
  /** Default job timeout in ms (default: 300000 = 5min) */
  defaultTimeout?: number;
}

/**
 * Job handler function type.
 */
export type JobHandler = (payload: unknown) => Promise<unknown>;

/**
 * Internal job representation with additional fields.
 */
interface InternalJob extends JobHandle {
  definition: JobDefinition;
  handler?: JobHandler;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * In-memory job scheduler with queue processing.
 */
export class JobScheduler implements IJobScheduler {
  private jobs = new Map<string, InternalJob>();
  private queue: string[] = [];
  private handlers = new Map<string, JobHandler>();
  private running = new Set<string>();
  private idCounter = 0;
  private pollTimer?: ReturnType<typeof setInterval>;
  private readonly config: Required<JobSchedulerConfig>;

  constructor(
    private resources: IResourceManager,
    private events: IEventBus,
    private logger: ILogger,
    config: JobSchedulerConfig = {}
  ) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      pollInterval: config.pollInterval ?? 1000,
      defaultTimeout: config.defaultTimeout ?? 300000,
    };

    // Start queue processor
    this.pollTimer = setInterval(() => this.processQueue(), this.config.pollInterval);
  }

  /**
   * Register a job handler for a job type.
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
    this.logger.debug('Job handler registered', { type });
  }

  /**
   * Unregister a job handler.
   */
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }

  async submit(job: JobDefinition): Promise<JobHandle> {
    const id = job.idempotencyKey ?? `job-${++this.idCounter}-${Date.now()}`;

    // Check for duplicate by idempotency key
    if (job.idempotencyKey && this.jobs.has(id)) {
      const existing = this.jobs.get(id)!;
      this.logger.debug('Duplicate job submission', { jobId: id, status: existing.status });
      return this.toHandle(existing);
    }

    const tenantId = job.tenantId ?? 'default';
    const now = new Date();

    const internalJob: InternalJob = {
      id,
      type: job.type,
      tenantId,
      status: 'pending',
      createdAt: now,
      definition: job,
    };

    this.jobs.set(id, internalJob);

    // If runAt is in the future, schedule for later
    if (job.runAt && job.runAt.getTime() > now.getTime()) {
      const delay = job.runAt.getTime() - now.getTime();
      setTimeout(() => this.enqueue(id), delay);
      this.logger.debug('Job scheduled for later', { jobId: id, runAt: job.runAt });
    } else {
      this.enqueue(id);
    }

    await this.events.publish('job.submitted', { jobId: id, type: job.type, tenantId });

    return this.toHandle(internalJob);
  }

  async schedule(
    job: JobDefinition,
    schedule: CronExpression | Date
  ): Promise<JobHandle> {
    // For Date, use runAt
    if (schedule instanceof Date) {
      return this.submit({ ...job, runAt: schedule });
    }

    // For cron expression, this should be handled by CronManager
    // Here we just submit immediately with a note
    this.logger.warn('Cron scheduling should use CronManager', {
      schedule,
      jobType: job.type,
    });
    return this.submit(job);
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {return false;}

    if (job.status === 'completed' || job.status === 'failed') {
      return false; // Can't cancel finished jobs
    }

    // Clear timeout if running
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    // Remove from queue if pending
    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }

    // Remove from running
    this.running.delete(jobId);

    await this.events.publish('job.cancelled', { jobId, type: job.type });
    this.logger.info('Job cancelled', { jobId });

    return true;
  }

  async getStatus(jobId: string): Promise<JobHandle | null> {
    const job = this.jobs.get(jobId);
    return job ? this.toHandle(job) : null;
  }

  async list(filter?: JobFilter): Promise<JobHandle[]> {
    let results = Array.from(this.jobs.values());

    if (filter?.type) {
      results = results.filter((j) => j.type === filter.type);
    }
    if (filter?.status) {
      results = results.filter((j) => j.status === filter.status);
    }
    if (filter?.tenantId) {
      results = results.filter((j) => j.tenantId === filter.tenantId);
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results.map((j) => this.toHandle(j));
  }

  /**
   * Add job to queue.
   */
  private enqueue(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') {return;}

    // Insert by priority (higher priority = earlier in queue)
    const priority = job.definition.priority ?? 50;
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const queuedJob = this.jobs.get(this.queue[i]!);
      const queuedPriority = queuedJob?.definition.priority ?? 50;
      if (priority > queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, jobId);
    this.logger.debug('Job enqueued', { jobId, queuePosition: insertIndex });
  }

  /**
   * Process queued jobs.
   */
  private async processQueue(): Promise<void> {
    // Check if we can run more jobs
    if (this.running.size >= this.config.maxConcurrent) {
      return;
    }

    // Get next job from queue
    while (this.queue.length > 0 && this.running.size < this.config.maxConcurrent) {
      const jobId = this.queue.shift();
      if (!jobId) {break;}

      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'pending') {continue;}

      // Try to acquire resource slot
      const slot = await this.resources.acquireSlot('job', job.tenantId, this.config.defaultTimeout);
      if (!slot) {
        // Put back in queue
        this.queue.unshift(jobId);
        break;
      }

      // Start job execution
      this.executeJob(job, slot.id).catch((err) => {
        this.logger.error('Job execution error', err as Error, { jobId: job.id });
      });
    }
  }

  /**
   * Execute a single job.
   */
  private async executeJob(job: InternalJob, slotId: string): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();
    this.running.add(job.id);

    await this.events.publish('job.started', { jobId: job.id, type: job.type });
    this.logger.info('Job started', { jobId: job.id, type: job.type });

    // Set timeout
    const timeout = job.definition.timeout ?? this.config.defaultTimeout;
    job.timeoutId = setTimeout(() => {
      if (job.status === 'running') {
        job.status = 'failed';
        job.error = 'Job timeout';
        job.completedAt = new Date();
        this.running.delete(job.id);
        this.events.publish('job.failed', { jobId: job.id, error: 'timeout' });
        this.logger.warn('Job timed out', { jobId: job.id });
      }
    }, timeout);

    try {
      // Get handler
      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Execute
      const result = await handler(job.definition.payload);

      // Success
      if (job.timeoutId) {clearTimeout(job.timeoutId);}

      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();

      await this.events.publish('job.completed', {
        jobId: job.id,
        type: job.type,
        result,
      });
      this.logger.info('Job completed', { jobId: job.id, type: job.type });
    } catch (error) {
      if (job.timeoutId) {clearTimeout(job.timeoutId);}

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if should retry
      const maxRetries = job.definition.maxRetries ?? 3;
      const currentRetries = (job as unknown as { _retryCount?: number })._retryCount ?? 0;

      if (currentRetries < maxRetries) {
        // Retry
        (job as unknown as { _retryCount: number })._retryCount = currentRetries + 1;
        job.status = 'pending';
        job.startedAt = undefined;
        this.enqueue(job.id);

        this.logger.warn('Job failed, retrying', {
          jobId: job.id,
          attempt: currentRetries + 1,
          maxRetries,
          error: errorMessage,
        });
      } else {
        // Final failure
        job.status = 'failed';
        job.error = errorMessage;
        job.completedAt = new Date();

        await this.events.publish('job.failed', {
          jobId: job.id,
          type: job.type,
          error: errorMessage,
        });
        this.logger.error('Job failed', error as Error, { jobId: job.id });
      }
    } finally {
      this.running.delete(job.id);

      // Release resource slot
      await this.resources.releaseSlot({
        id: slotId,
        resource: 'job',
        tenantId: job.tenantId,
        acquiredAt: job.startedAt ?? new Date(),
      });
    }
  }

  /**
   * Convert internal job to public handle.
   */
  private toHandle(job: InternalJob): JobHandle {
    return {
      id: job.id,
      type: job.type,
      tenantId: job.tenantId,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  /**
   * Stop the scheduler (for cleanup).
   */
  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Get scheduler stats (for monitoring).
   */
  getStats(): {
    totalJobs: number;
    queueLength: number;
    runningCount: number;
    byStatus: Record<string, number>;
  } {
    const byStatus: Record<string, number> = {};

    for (const job of this.jobs.values()) {
      byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;
    }

    return {
      totalJobs: this.jobs.size,
      queueLength: this.queue.length,
      runningCount: this.running.size,
      byStatus,
    };
  }
}
