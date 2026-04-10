/**
 * @module @kb-labs/core-platform/noop/core/cron
 * NoOp cron manager implementation.
 */

import type {
  ICronManager,
  CronJob,
  CronHandler,
} from '../../core/cron.js';
import type { CronExpression } from '../../core/jobs.js';

interface CronEntry {
  id: string;
  schedule: CronExpression;
  handler: CronHandler;
  status: 'active' | 'paused';
  lastRun?: Date;
  runCount: number;
}

/**
 * NoOp cron manager that stores registrations but doesn't schedule.
 * Use trigger() to manually execute cron jobs in tests.
 */
export class NoOpCronManager implements ICronManager {
  private cronJobs = new Map<string, CronEntry>();

  register(id: string, schedule: CronExpression, handler: CronHandler): void {
    this.cronJobs.set(id, {
      id,
      schedule,
      handler,
      status: 'active',
      runCount: 0,
    });
  }

  unregister(id: string): void {
    this.cronJobs.delete(id);
  }

  list(): CronJob[] {
    return Array.from(this.cronJobs.values()).map((entry) => ({
      id: entry.id,
      schedule: entry.schedule,
      status: entry.status,
      lastRun: entry.lastRun,
      nextRun: undefined, // NoOp doesn't calculate next run
      runCount: entry.runCount,
    }));
  }

  async trigger(id: string): Promise<void> {
    const entry = this.cronJobs.get(id);
    if (!entry) {
      throw new Error(`Cron job not found: ${id}`);
    }

    if (entry.status === 'paused') {
      throw new Error(`Cron job is paused: ${id}`);
    }

    const now = new Date();

    // Execute the handler
    await entry.handler({
      jobId: id,
      scheduledAt: now,
      executedAt: now,
      runCount: entry.runCount + 1,
    });

    entry.lastRun = now;
    entry.runCount++;
  }

  pause(id: string): void {
    const entry = this.cronJobs.get(id);
    if (entry) {
      entry.status = 'paused';
    }
  }

  resume(id: string): void {
    const entry = this.cronJobs.get(id);
    if (entry) {
      entry.status = 'active';
    }
  }

  /**
   * Clear all cron jobs (for testing).
   */
  clear(): void {
    this.cronJobs.clear();
  }
}
