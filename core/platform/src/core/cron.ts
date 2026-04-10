/**
 * @module @kb-labs/core-platform/core/cron
 * Cron manager interface for scheduled task registration.
 */

import type { CronExpression } from "./jobs.js";

/**
 * Cron job context passed to handlers.
 */
export interface CronContext {
  /** Cron job identifier */
  jobId: string;
  /** Scheduled execution time */
  scheduledAt: Date;
  /** Actual execution time */
  executedAt: Date;
  /** Run count */
  runCount: number;
}

/**
 * Cron handler function type.
 */
export type CronHandler = (ctx: CronContext) => Promise<void>;

/**
 * Registered cron job status.
 */
export interface CronJob {
  /** Job identifier */
  id: string;
  /** Cron schedule expression */
  schedule: CronExpression;
  /** Current status */
  status: "active" | "paused";
  /** Last execution time */
  lastRun?: Date;
  /** Next scheduled execution time */
  nextRun?: Date;
  /** Total run count */
  runCount: number;
}

/**
 * Cron manager interface.
 * Core feature - implemented in @kb-labs/core-runtime, not replaceable.
 */
export interface ICronManager {
  /**
   * Register a cron job.
   * @param id - Unique job identifier
   * @param schedule - Cron expression (e.g., "0 * * * *" or "@hourly")
   * @param handler - Handler function to execute
   */
  register(id: string, schedule: CronExpression, handler: CronHandler): void;

  /**
   * Unregister a cron job.
   * @param id - Job identifier
   */
  unregister(id: string): void;

  /**
   * List all registered cron jobs.
   */
  list(): CronJob[];

  /**
   * Manually trigger a cron job.
   * @param id - Job identifier
   */
  trigger(id: string): Promise<void>;

  /**
   * Pause a cron job.
   * @param id - Job identifier
   */
  pause(id: string): void;

  /**
   * Resume a paused cron job.
   * @param id - Job identifier
   */
  resume(id: string): void;
}
