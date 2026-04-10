/**
 * Cron API for V3 Plugin System
 *
 * API for registering and managing recurring scheduled tasks (cron jobs).
 * Cron jobs are different from workflows and jobs:
 * - Workflows: Multi-step processes with complex orchestration
 * - Jobs: One-off background tasks with retry logic
 * - Cron: Recurring tasks triggered on schedule
 */

// ============================================================================
// Cron Registration
// ============================================================================

/**
 * Cron job registration request
 */
export interface CronRegistration {
  /**
   * Unique cron job identifier
   * Recommended format: `pluginId:task-name`
   */
  id: string;

  /**
   * Cron schedule expression
   * Examples:
   * - "0 * * * *" - Every hour
   * - "@hourly" - Every hour (alias)
   * - "0 0 * * *" - Daily at midnight
   * - "@daily" - Daily at midnight (alias)
   * - "0 9 * * 1-5" - Weekdays at 9 AM
   */
  schedule: string;

  /**
   * Job type to execute on schedule
   * Must match a registered job handler
   */
  jobType: string;

  /**
   * Payload to pass to the job handler
   */
  payload?: unknown;

  /**
   * Timezone for schedule (default: UTC)
   * Examples: "America/Los_Angeles", "Europe/London"
   */
  timezone?: string;

  /**
   * Whether the cron job starts enabled (default: true)
   */
  enabled?: boolean;
}

// ============================================================================
// Cron Status
// ============================================================================

/**
 * Cron job status
 */
export type CronStatus = 'active' | 'paused';

/**
 * Cron job information
 */
export interface CronInfo {
  /**
   * Cron job identifier
   */
  id: string;

  /**
   * Cron schedule expression
   */
  schedule: string;

  /**
   * Job type executed on schedule
   */
  jobType: string;

  /**
   * Current status
   */
  status: CronStatus;

  /**
   * Last execution time
   */
  lastRun?: Date;

  /**
   * Next scheduled execution time
   */
  nextRun?: Date;

  /**
   * Total run count
   */
  runCount: number;
}

// ============================================================================
// Cron API
// ============================================================================

/**
 * API for managing recurring scheduled tasks (cron jobs)
 *
 * Use cron for:
 * - Periodic cleanup tasks (e.g., delete old logs daily)
 * - Scheduled data sync (e.g., pull from external API hourly)
 * - Recurring reports (e.g., send weekly summary email)
 * - Maintenance tasks (e.g., rebuild search index nightly)
 *
 * Cron jobs persist across platform restarts and are managed by CronManager.
 */
export interface CronAPI {
  /**
   * Register a new cron job
   *
   * @param registration - Cron job registration details
   * @returns void
   *
   * @example
   * ```typescript
   * // Schedule daily cleanup at midnight UTC
   * await ctx.api.cron.register({
   *   id: 'my-plugin:daily-cleanup',
   *   schedule: '0 0 * * *',
   *   jobType: 'my-plugin:cleanup-old-data',
   *   payload: { retentionDays: 30 }
   * });
   * ```
   */
  register(registration: CronRegistration): Promise<void>;

  /**
   * Unregister a cron job
   *
   * @param id - Cron job identifier
   * @returns void
   *
   * @example
   * ```typescript
   * await ctx.api.cron.unregister('my-plugin:daily-cleanup');
   * ```
   */
  unregister(id: string): Promise<void>;

  /**
   * List all cron jobs
   *
   * @returns List of cron job information
   *
   * @example
   * ```typescript
   * const cronJobs = await ctx.api.cron.list();
   * for (const job of cronJobs) {
   *   ctx.ui.info(`${job.id}: ${job.status} (next run: ${job.nextRun})`);
   * }
   * ```
   */
  list(): Promise<CronInfo[]>;

  /**
   * Manually trigger a cron job (run immediately)
   *
   * @param id - Cron job identifier
   * @returns void
   *
   * @example
   * ```typescript
   * // Trigger cleanup job manually without waiting for schedule
   * await ctx.api.cron.trigger('my-plugin:daily-cleanup');
   * ```
   */
  trigger(id: string): Promise<void>;

  /**
   * Pause a cron job (stops scheduled execution)
   *
   * @param id - Cron job identifier
   * @returns void
   *
   * @example
   * ```typescript
   * await ctx.api.cron.pause('my-plugin:daily-cleanup');
   * ```
   */
  pause(id: string): Promise<void>;

  /**
   * Resume a paused cron job
   *
   * @param id - Cron job identifier
   * @returns void
   *
   * @example
   * ```typescript
   * await ctx.api.cron.resume('my-plugin:daily-cleanup');
   * ```
   */
  resume(id: string): Promise<void>;
}
