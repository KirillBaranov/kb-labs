/**
 * @module @kb-labs/core-platform/core/jobs
 * Job scheduler interface for background task execution.
 */

/**
 * Job definition for submission.
 */
export interface JobDefinition {
  /** Job type identifier */
  type: string;
  /** Job payload data */
  payload: unknown;
  /** Tenant identifier for multi-tenancy */
  tenantId?: string;
  /** Priority (0-100, higher = more important, default 50) */
  priority?: number;
  /** Maximum retry attempts (default 3) */
  maxRetries?: number;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Schedule for delayed execution */
  runAt?: Date;
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
}

/**
 * Job execution status.
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Job handle returned after submission.
 */
export interface JobHandle {
  /** Job identifier */
  id: string;
  /** Job type */
  type: string;
  /** Tenant identifier */
  tenantId: string;
  /** Current status */
  status: JobStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Job result if completed */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Creation time */
  createdAt: Date;
  /** Start time */
  startedAt?: Date;
  /** Completion time */
  completedAt?: Date;
}

/**
 * Cron expression type (e.g., "0 * * * *" or "@hourly").
 */
export type CronExpression = string;

/**
 * Filter for listing jobs.
 */
export interface JobFilter {
  /** Filter by job type */
  type?: string;
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by status */
  status?: JobStatus;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Job scheduler interface.
 * Core feature - implemented in @kb-labs/core-runtime, not replaceable.
 */
export interface IJobScheduler {
  /**
   * Submit a job for immediate execution.
   * @param job - Job definition
   */
  submit(job: JobDefinition): Promise<JobHandle>;

  /**
   * Schedule a job for future/recurring execution.
   * @param job - Job definition
   * @param schedule - Cron expression or specific date
   */
  schedule(job: JobDefinition, schedule: CronExpression | Date): Promise<JobHandle>;

  /**
   * Cancel a pending/running job.
   * @param jobId - Job identifier
   * @returns true if cancelled, false if not found
   */
  cancel(jobId: string): Promise<boolean>;

  /**
   * Get job status.
   * @param jobId - Job identifier
   */
  getStatus(jobId: string): Promise<JobHandle | null>;

  /**
   * List jobs.
   * @param filter - Optional filter criteria
   */
  list(filter?: JobFilter): Promise<JobHandle[]>;
}
