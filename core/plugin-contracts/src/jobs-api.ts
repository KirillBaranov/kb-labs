/**
 * Jobs API for V3 Plugin System
 *
 * Simplified API for submitting background jobs.
 * Jobs are simpler than workflows - single-step tasks with retry logic.
 */

// ============================================================================
// Job Definition
// ============================================================================

/**
 * Job definition for submission
 */
export interface JobSubmission {
  /**
   * Job type identifier (used to route to job handler)
   */
  type: string;

  /**
   * Job payload data
   */
  payload: unknown;

  /**
   * Priority (0-100, higher = more important, default 50)
   */
  priority?: number;

  /**
   * Maximum retry attempts (default 3)
   */
  maxRetries?: number;

  /**
   * Execution timeout in milliseconds
   */
  timeout?: number;

  /**
   * Schedule for delayed execution
   */
  runAt?: Date;

  /**
   * Idempotency key to prevent duplicates
   */
  idempotencyKey?: string;
}

// ============================================================================
// Job Status
// ============================================================================

/**
 * Job execution status
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Job status information
 */
export interface JobStatusInfo {
  /**
   * Job identifier
   */
  id: string;

  /**
   * Job type
   */
  type: string;

  /**
   * Current status
   */
  status: JobStatus;

  /**
   * Progress percentage (0-100)
   */
  progress?: number;

  /**
   * Job result (available when completed)
   */
  result?: unknown;

  /**
   * Error message (available when failed)
   */
  error?: string;

  /**
   * Creation time
   */
  createdAt: Date;

  /**
   * Start time
   */
  startedAt?: Date;

  /**
   * Completion time
   */
  completedAt?: Date;
}

// ============================================================================
// Job List Filter
// ============================================================================

/**
 * Filter for listing jobs
 */
export interface JobListFilter {
  /**
   * Filter by job type
   */
  type?: string;

  /**
   * Filter by status
   */
  status?: JobStatus;

  /**
   * Limit results (default 50)
   */
  limit?: number;

  /**
   * Offset for pagination
   */
  offset?: number;
}

// ============================================================================
// Job Wait Options
// ============================================================================

/**
 * Options for waiting on job completion
 */
export interface JobWaitOptions {
  /**
   * Maximum time to wait in milliseconds
   */
  timeout?: number;

  /**
   * Poll interval in milliseconds (default 1000)
   */
  pollInterval?: number;
}

// ============================================================================
// Jobs API
// ============================================================================

/**
 * API for submitting background jobs
 *
 * Jobs are simpler than workflows - single-step tasks with automatic retry logic.
 * Use jobs for:
 * - One-off background tasks (e.g., send email, process file)
 * - Scheduled tasks (e.g., daily cleanup, hourly sync)
 * - Retry-able operations (e.g., external API calls)
 *
 * Jobs persist in platform cache (Redis/Memory) and are executed by worker processes.
 */
export interface JobsAPI {
  /**
   * Submit a job for immediate execution
   *
   * @param job - Job definition
   * @returns Job identifier for tracking status
   *
   * @example
   * ```typescript
   * // Submit a background job
   * const jobId = await ctx.api.jobs.submit({
   *   type: 'send-email',
   *   payload: { to: 'user@example.com', subject: 'Hello' }
   * });
   * return { jobId };
   * ```
   */
  submit(job: JobSubmission): Promise<string>;

  /**
   * Schedule a job for future/recurring execution
   *
   * @param job - Job definition
   * @param schedule - Cron expression (e.g., "0 * * * *") or specific date
   * @returns Job identifier
   *
   * @example
   * ```typescript
   * // Schedule daily cleanup at midnight
   * const jobId = await ctx.api.jobs.schedule(
   *   { type: 'cleanup-old-logs', payload: {} },
   *   '0 0 * * *'
   * );
   * ```
   */
  schedule(job: JobSubmission, schedule: string | Date): Promise<string>;

  /**
   * Wait for job completion
   *
   * @param jobId - Job identifier
   * @param options - Wait options
   * @returns Job result
   * @throws Error if job fails or timeout is reached
   *
   * @example
   * ```typescript
   * const jobId = await ctx.api.jobs.submit({ type: 'process-file', payload: { path } });
   * const result = await ctx.api.jobs.wait(jobId, { timeout: 60000 });
   * ```
   */
  wait(jobId: string, options?: JobWaitOptions): Promise<unknown>;

  /**
   * Get job status
   *
   * @param jobId - Job identifier
   * @returns Status information or null if not found
   *
   * @example
   * ```typescript
   * const status = await ctx.api.jobs.status(jobId);
   * if (status?.status === 'completed') {
   *   return status.result;
   * }
   * ```
   */
  status(jobId: string): Promise<JobStatusInfo | null>;

  /**
   * Cancel a pending/running job
   *
   * @param jobId - Job identifier
   * @returns true if cancelled, false if not found
   *
   * @example
   * ```typescript
   * const cancelled = await ctx.api.jobs.cancel(jobId);
   * ```
   */
  cancel(jobId: string): Promise<boolean>;

  /**
   * List jobs
   *
   * @param filter - Optional filter criteria
   * @returns List of jobs
   *
   * @example
   * ```typescript
   * // List failed jobs
   * const failed = await ctx.api.jobs.list({ status: 'failed', limit: 10 });
   * ```
   */
  list(filter?: JobListFilter): Promise<JobStatusInfo[]>;
}
