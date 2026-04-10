/**
 * @module @kb-labs/workflow-engine/job-manager
 * Job manager for background task execution with sandboxed handlers.
 */

import type {
  IJobScheduler,
  JobDefinition,
  JobHandle,
  JobStatus,
  JobFilter,
  CronExpression,
  ICache,
  ILogger,
  IEventBus,
} from '@kb-labs/core-platform';
import type { JobHandlerDecl, PluginContextDescriptor } from '@kb-labs/plugin-contracts';
import type { IExecutionBackend, ExecutionRequest } from '@kb-labs/core-contracts';
import { nanoid } from 'nanoid';

/**
 * Job handler registry entry.
 */
interface JobHandlerRegistry {
  pluginId: string;
  jobId: string;
  handlerPath: string;
  config: JobHandlerDecl;
  pluginRoot: string;
  pluginVersion: string;
}

/**
 * Internal job record stored in cache.
 */
interface JobRecord {
  id: string;
  type: string;
  payload: unknown;
  tenantId: string;
  status: JobStatus;
  priority: number;
  maxRetries: number;
  timeout: number;
  attempt: number;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  runAt?: string;
  idempotencyKey?: string;
}

/**
 * Job queue entry for scheduling.
 */
interface JobQueueEntry {
  jobId: string;
  priority: number;
  availableAt: number;
}

export interface JobManagerConfig {
  /** Execution backend for sandboxed handler execution */
  executionBackend?: IExecutionBackend<PluginContextDescriptor>;
  /** Default job timeout in ms (default: 300000 = 5 min) */
  defaultTimeout?: number;
  /** Default max retries (default: 3) */
  defaultMaxRetries?: number;
  /** Default priority (default: 50) */
  defaultPriority?: number;
  /** Workspace root (monorepo root) for plugin execution context */
  workspaceRoot?: string;
}

/**
 * Job manager - handles background job execution with sandboxed handlers.
 *
 * Features:
 * - Declarative job handlers from plugin manifests
 * - Priority-based queue (0-100, higher = more important)
 * - Retry with exponential/linear backoff
 * - Sandboxed subprocess execution via ExecutionBackend
 * - Progress tracking and status updates
 * - Idempotency support
 *
 * Architecture:
 * 1. Plugin declares job handlers in manifest.json
 * 2. Plugin runtime registers handlers via registerJobHandler()
 * 3. Plugin submits jobs via ctx.api.jobs.submit()
 * 4. JobManager enqueues job in priority queue (platform.cache sorted sets)
 * 5. Worker dequeues job and executes via ExecutionBackend.execute()
 * 6. Handler runs in subprocess with JobContext
 * 7. Results stored in cache, events emitted
 */
export class JobManager implements IJobScheduler {
  private handlerRegistry = new Map<string, JobHandlerRegistry>();
  private readonly defaultTimeout: number;
  private readonly defaultMaxRetries: number;
  private readonly defaultPriority: number;
  private readonly workspaceRoot: string;

  constructor(
    private readonly cache: ICache,
    private readonly events: IEventBus,
    private readonly logger: ILogger,
    private readonly config: JobManagerConfig = {}
  ) {
    this.defaultTimeout = config.defaultTimeout ?? 300000; // 5 min
    this.defaultMaxRetries = config.defaultMaxRetries ?? 3;
    this.defaultPriority = config.defaultPriority ?? 50;
    this.workspaceRoot = config.workspaceRoot ?? process.cwd(); // Fallback to process.cwd()
  }

  /**
   * Register job handler from plugin manifest.
   *
   * Called by plugin-runtime during plugin initialization.
   *
   * @param pluginId - Plugin identifier
   * @param pluginVersion - Plugin version
   * @param pluginRoot - Plugin root directory
   * @param handlerDecl - Job handler declaration from manifest
   */
  registerJobHandler(
    pluginId: string,
    pluginVersion: string,
    pluginRoot: string,
    handlerDecl: JobHandlerDecl
  ): void {
    const jobType = `${pluginId}:${handlerDecl.id}`;

    if (this.handlerRegistry.has(jobType)) {
      this.logger.warn('Job handler already registered, overwriting', {
        jobType,
        pluginId,
        jobId: handlerDecl.id,
      });
    }

    this.handlerRegistry.set(jobType, {
      pluginId,
      jobId: handlerDecl.id,
      handlerPath: handlerDecl.handler,
      config: handlerDecl,
      pluginRoot,
      pluginVersion,
    });

    this.logger.info('Registered job handler', {
      jobType,
      handler: handlerDecl.handler,
    });
  }

  /**
   * Submit a job for immediate execution.
   */
  async submit(job: JobDefinition): Promise<JobHandle> {
    // Validate handler exists
    const handlerEntry = this.handlerRegistry.get(job.type);
    if (!handlerEntry) {
      throw new Error(`Job handler not found: ${job.type}`);
    }

    // Check idempotency
    if (job.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(job.idempotencyKey);
      if (existing) {
        this.logger.info('Job already submitted (idempotent)', {
          idempotencyKey: job.idempotencyKey,
          existingJobId: existing.id,
        });
        return this.jobRecordToHandle(existing);
      }
    }

    // Create job record
    const jobId = nanoid();
    const now = new Date();
    const record: JobRecord = {
      id: jobId,
      type: job.type,
      payload: job.payload,
      tenantId: job.tenantId ?? 'default',
      status: 'pending',
      priority: job.priority ?? this.defaultPriority,
      maxRetries: job.maxRetries ?? handlerEntry.config.maxRetries ?? this.defaultMaxRetries,
      timeout: job.timeout ?? handlerEntry.config.timeout ?? this.defaultTimeout,
      attempt: 0,
      progress: 0,
      createdAt: now.toISOString(),
      runAt: job.runAt?.toISOString(),
      idempotencyKey: job.idempotencyKey,
    };

    // Store job record
    await this.saveJobRecord(record);

    // Enqueue for execution
    const availableAt = job.runAt ? job.runAt.getTime() : Date.now();
    await this.enqueueJob(jobId, record.priority, availableAt);

    this.logger.info('Job submitted', {
      jobId,
      type: job.type,
      tenantId: record.tenantId,
      priority: record.priority,
    });

    // Emit event
    await this.events.publish('job.submitted', {
      jobId,
      type: job.type,
      tenantId: record.tenantId,
    });

    return this.jobRecordToHandle(record);
  }

  /**
   * Schedule a job for future/recurring execution.
   */
  async schedule(job: JobDefinition, schedule: CronExpression | Date): Promise<JobHandle> {
    if (schedule instanceof Date) {
      // One-time scheduled job
      return this.submit({ ...job, runAt: schedule });
    }

    // TODO: Cron scheduling - integrate with CronManager
    throw new Error('Cron scheduling not yet implemented');
  }

  /**
   * Cancel a pending/running job.
   */
  async cancel(jobId: string): Promise<boolean> {
    const record = await this.getJobRecord(jobId);
    if (!record) {
      return false;
    }

    if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
      this.logger.warn('Cannot cancel job in terminal state', {
        jobId,
        status: record.status,
      });
      return false;
    }

    // Update status
    record.status = 'cancelled';
    record.completedAt = new Date().toISOString();
    await this.saveJobRecord(record);

    // Remove from queue
    await this.removeFromQueue(jobId);

    this.logger.info('Job cancelled', { jobId });

    // Emit event
    await this.events.publish('job.cancelled', {
      jobId,
      type: record.type,
      tenantId: record.tenantId,
    });

    return true;
  }

  /**
   * Get job status.
   */
  async getStatus(jobId: string): Promise<JobHandle | null> {
    const record = await this.getJobRecord(jobId);
    if (!record) {
      return null;
    }
    return this.jobRecordToHandle(record);
  }

  /**
   * List jobs.
   */
  async list(filter: JobFilter = {}): Promise<JobHandle[]> {
    // TODO: Implement efficient filtering
    // For now, simple scan approach
    const pattern = 'kb:job:*';
    const keys = await this.getAllJobKeys(pattern);

    // Fetch all job records in parallel
    const allRecords = await Promise.all(keys.map(key => this.cache.get<JobRecord>(key)));

    // Filter out nulls and apply filters
    const records = allRecords.filter((data): data is JobRecord => {
      if (!data) {return false;}

      // Apply filters
      if (filter.type && data.type !== filter.type) {return false;}
      if (filter.tenantId && data.tenantId !== filter.tenantId) {return false;}
      if (filter.status && data.status !== filter.status) {return false;}

      return true;
    });

    // Sort by creation time (newest first)
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    const page = records.slice(offset, offset + limit);

    return page.map(r => this.jobRecordToHandle(r));
  }

  /**
   * Execute a job (called by worker).
   *
   * @internal
   */
  async executeJob(jobId: string): Promise<void> {
    const record = await this.getJobRecord(jobId);
    if (!record) {
      this.logger.error('Job not found for execution', undefined, { jobId });
      return;
    }

    const handlerEntry = this.handlerRegistry.get(record.type);
    if (!handlerEntry) {
      this.logger.error('Job handler not found', undefined, { jobId, type: record.type });
      await this.markJobFailed(record, 'Handler not found');
      return;
    }

    // Check if execution backend is available
    if (!this.config.executionBackend) {
      this.logger.error('ExecutionBackend not configured', undefined, { jobId });
      await this.markJobFailed(record, 'ExecutionBackend not configured');
      return;
    }

    // Update status to running
    record.status = 'running';
    record.attempt += 1;
    record.startedAt = new Date().toISOString();
    await this.saveJobRecord(record);

    // Emit event
    await this.events.publish('job.started', {
      jobId,
      type: record.type,
      tenantId: record.tenantId,
      attempt: record.attempt,
    });

    try {
      // Build execution request
      const executionId = `job-${jobId}-${record.attempt}`;
      const traceId = executionId;
      const spanId = executionId;
      const invocationId = executionId;

      // Create minimal descriptor for job context
      const descriptor: PluginContextDescriptor = {
        hostType: 'cron',
        hostContext: {
          host: 'cron',
          cronId: record.type,
          schedule: '', // Not available in job context
          scheduledAt: new Date().toISOString(),
        },
        permissions: handlerEntry.config.permissions ?? {},
        pluginId: handlerEntry.pluginId,
        pluginVersion: '0.0.0', // TODO: Get from manifest
        requestId: executionId,
        tenantId: record.tenantId,
      };
      Object.assign(descriptor as unknown as Record<string, unknown>, {
        traceId,
        spanId,
        invocationId,
        executionId,
      });

      const request: ExecutionRequest<PluginContextDescriptor> = {
        executionId,
        descriptor,
        pluginRoot: handlerEntry.pluginRoot,
        handlerRef: handlerEntry.handlerPath,
        input: {
          jobId,
          type: record.type,
          input: record.payload,
          tenantId: record.tenantId,
          attempt: record.attempt,
        },
        timeoutMs: record.timeout,
      };

      this.logger.debug('Executing job handler', {
        jobId,
        handler: handlerEntry.handlerPath,
        attempt: record.attempt,
      });

      // Execute in subprocess
      const result = await this.config.executionBackend.execute(request, {
        signal: undefined, // TODO: Support cancellation
      });

      if (result.ok) {
        // Job succeeded
        record.status = 'completed';
        record.result = result.data;
        record.progress = 100;
        record.completedAt = new Date().toISOString();
        await this.saveJobRecord(record);

        this.logger.info('Job completed', {
          jobId,
          type: record.type,
          duration: result.executionTimeMs,
        });

        await this.events.publish('job.completed', {
          jobId,
          type: record.type,
          tenantId: record.tenantId,
          result: result.data,
        });
      } else {
        // Job failed
        const errorMsg = result.error?.message ?? 'Unknown error';
        await this.handleJobFailure(record, errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Job execution failed', undefined, { jobId, error: errorMsg });
      await this.handleJobFailure(record, errorMsg);
    }
  }

  /**
   * Update job progress.
   *
   * Called by job handler via ctx.updateProgress()
   */
  async updateProgress(jobId: string, percent: number, message?: string): Promise<void> {
    const record = await this.getJobRecord(jobId);
    if (!record) {
      this.logger.warn('Cannot update progress: job not found', { jobId });
      return;
    }

    record.progress = Math.max(0, Math.min(100, percent));
    await this.saveJobRecord(record);

    await this.events.publish('job.progress', {
      jobId,
      type: record.type,
      tenantId: record.tenantId,
      progress: record.progress,
      message,
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async handleJobFailure(record: JobRecord, errorMsg: string): Promise<void> {
    if (record.attempt < record.maxRetries) {
      // Retry with backoff
      const backoffMs = this.calculateBackoff(record.attempt, record.type);
      const availableAt = Date.now() + backoffMs;

      record.status = 'pending';
      await this.saveJobRecord(record);
      await this.enqueueJob(record.id, record.priority, availableAt);

      this.logger.info('Job retry scheduled', {
        jobId: record.id,
        attempt: record.attempt,
        maxRetries: record.maxRetries,
        backoffMs,
      });

      await this.events.publish('job.retry', {
        jobId: record.id,
        type: record.type,
        tenantId: record.tenantId,
        attempt: record.attempt,
        backoffMs,
      });
    } else {
      // Max retries exceeded
      await this.markJobFailed(record, errorMsg);
    }
  }

  private async markJobFailed(record: JobRecord, errorMsg: string): Promise<void> {
    record.status = 'failed';
    record.error = errorMsg;
    record.completedAt = new Date().toISOString();
    await this.saveJobRecord(record);

    this.logger.error('Job failed', undefined, {
      jobId: record.id,
      type: record.type,
      error: errorMsg,
      attempt: record.attempt,
    });

    await this.events.publish('job.failed', {
      jobId: record.id,
      type: record.type,
      tenantId: record.tenantId,
      error: errorMsg,
    });
  }

  private calculateBackoff(attempt: number, jobType: string): number {
    const handlerEntry = this.handlerRegistry.get(jobType);
    const strategy = handlerEntry?.config.retryBackoff ?? 'exp';

    if (strategy === 'exp') {
      // Exponential: 1s, 2s, 4s, 8s, ...
      return Math.min(1000 * Math.pow(2, attempt), 60000);
    } else {
      // Linear: 5s, 10s, 15s, 20s, ...
      return Math.min(5000 * (attempt + 1), 60000);
    }
  }

  private async saveJobRecord(record: JobRecord): Promise<void> {
    const key = `kb:job:${record.id}`;
    await this.cache.set(key, record, 7 * 24 * 60 * 60 * 1000); // 7 days TTL
  }

  private async getJobRecord(jobId: string): Promise<JobRecord | null> {
    const key = `kb:job:${jobId}`;
    return this.cache.get<JobRecord>(key);
  }

  private async enqueueJob(jobId: string, priority: number, availableAt: number): Promise<void> {
    const entry: JobQueueEntry = {
      jobId,
      priority,
      availableAt,
    };
    await this.cache.zadd('kb:jobqueue', availableAt, JSON.stringify(entry));
  }

  private async removeFromQueue(jobId: string): Promise<void> {
    // Scan queue and remove matching entry
    const results = await this.cache.zrangebyscore('kb:jobqueue', 0, Date.now() + 1000000);
    // Sequential search - must break on first match to avoid unnecessary zrem calls
    for (const raw of results) {
      try {
        const entry = JSON.parse(raw) as JobQueueEntry;
        if (entry.jobId === jobId) {
          await this.cache.zrem('kb:jobqueue', raw); // eslint-disable-line no-await-in-loop
          break;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private async findByIdempotencyKey(key: string): Promise<JobRecord | null> {
    // TODO: Implement efficient lookup (maybe secondary index)
    const pattern = 'kb:job:*';
    const keys = await this.getAllJobKeys(pattern);

    // Fetch all records in parallel and find match
    const records = await Promise.all(keys.map(k => this.cache.get<JobRecord>(k)));

    return records.find(record => record?.idempotencyKey === key) ?? null;
  }

  private async getAllJobKeys(_pattern: string): Promise<string[]> {
    // TODO: Implement efficient key scanning
    // For now, this is a placeholder - real implementation would use cache.scan()
    // or maintain a separate index
    return [];
  }

  private jobRecordToHandle(record: JobRecord): JobHandle {
    return {
      id: record.id,
      type: record.type,
      tenantId: record.tenantId,
      status: record.status,
      progress: record.progress,
      result: record.result,
      error: record.error,
      createdAt: new Date(record.createdAt),
      startedAt: record.startedAt ? new Date(record.startedAt) : undefined,
      completedAt: record.completedAt ? new Date(record.completedAt) : undefined,
    };
  }
}
