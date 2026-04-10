/**
 * @module @kb-labs/core-runtime/core/cron-manager
 * Cron job manager with scheduling support.
 */

import type {
  ICronManager,
  CronJob,
  CronHandler,
  CronContext,
  ILogger,
} from '@kb-labs/core-platform';
import type { CronExpression } from '@kb-labs/core-platform';

/**
 * Internal cron job entry.
 */
interface CronEntry {
  id: string;
  schedule: CronExpression;
  handler: CronHandler;
  status: 'active' | 'paused';
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  timerId?: ReturnType<typeof setTimeout>;
}

/**
 * Parse simple cron expressions.
 * Supports: @hourly, @daily, @weekly, @monthly, @yearly
 * And basic cron: "* * * * *" (minute hour day month weekday)
 */
function parseNextRun(schedule: CronExpression, from: Date = new Date()): Date {
  const next = new Date(from);

  // Handle shortcuts
  switch (schedule) {
    case '@hourly':
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;

    case '@daily':
    case '@midnight':
      next.setDate(next.getDate() + 1);
      next.setHours(0);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;

    case '@weekly':
      next.setDate(next.getDate() + (7 - next.getDay()));
      next.setHours(0);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;

    case '@monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;

    case '@yearly':
    case '@annually':
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0);
      next.setDate(1);
      next.setHours(0);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;
  }

  // Parse standard cron expression (simplified)
  const parts = schedule.split(' ');
  if (parts.length === 5) {
    const [minute, hour] = parts;

    // Handle "*/N" interval syntax
    if (minute?.startsWith('*/')) {
      const interval = parseInt(minute.substring(2), 10);
      if (!isNaN(interval)) {
        next.setMinutes(next.getMinutes() + interval);
        next.setSeconds(0);
        next.setMilliseconds(0);
        return next;
      }
    }

    // Simple case: specific minute and hour
    const targetMinute = minute === '*' ? next.getMinutes() : parseInt(minute ?? '0', 10);
    const targetHour = hour === '*' ? next.getHours() : parseInt(hour ?? '0', 10);

    if (!isNaN(targetMinute) && !isNaN(targetHour)) {
      next.setHours(targetHour);
      next.setMinutes(targetMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);

      // If already passed, move to next day
      if (next <= from) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }
  }

  // Fallback: 1 hour from now
  next.setHours(next.getHours() + 1);
  return next;
}

/**
 * In-memory cron manager with scheduling.
 */
export class CronManager implements ICronManager {
  private jobs = new Map<string, CronEntry>();

  constructor(private logger: ILogger) {}

  register(id: string, schedule: CronExpression, handler: CronHandler): void {
    // Unregister if exists
    if (this.jobs.has(id)) {
      this.unregister(id);
    }

    const nextRun = parseNextRun(schedule);
    const entry: CronEntry = {
      id,
      schedule,
      handler,
      status: 'active',
      nextRun,
      runCount: 0,
    };

    this.jobs.set(id, entry);
    this.scheduleNext(entry);

    this.logger.info('Cron job registered', {
      id,
      schedule,
      nextRun: nextRun.toISOString(),
    });
  }

  unregister(id: string): void {
    const entry = this.jobs.get(id);
    if (!entry) {return;}

    if (entry.timerId) {
      clearTimeout(entry.timerId);
    }

    this.jobs.delete(id);
    this.logger.info('Cron job unregistered', { id });
  }

  list(): CronJob[] {
    return Array.from(this.jobs.values()).map((entry) => ({
      id: entry.id,
      schedule: entry.schedule,
      status: entry.status,
      lastRun: entry.lastRun,
      nextRun: entry.nextRun,
      runCount: entry.runCount,
    }));
  }

  async trigger(id: string): Promise<void> {
    const entry = this.jobs.get(id);
    if (!entry) {
      throw new Error(`Cron job not found: ${id}`);
    }

    await this.executeJob(entry);
  }

  pause(id: string): void {
    const entry = this.jobs.get(id);
    if (!entry) {return;}

    if (entry.timerId) {
      clearTimeout(entry.timerId);
      entry.timerId = undefined;
    }

    entry.status = 'paused';
    this.logger.info('Cron job paused', { id });
  }

  resume(id: string): void {
    const entry = this.jobs.get(id);
    if (!entry || entry.status !== 'paused') {return;}

    entry.status = 'active';
    entry.nextRun = parseNextRun(entry.schedule);
    this.scheduleNext(entry);

    this.logger.info('Cron job resumed', { id, nextRun: entry.nextRun });
  }

  /**
   * Schedule the next execution of a cron job.
   */
  private scheduleNext(entry: CronEntry): void {
    if (entry.status !== 'active' || !entry.nextRun) {return;}

    const delay = Math.max(0, entry.nextRun.getTime() - Date.now());

    entry.timerId = setTimeout(async () => {
      if (entry.status !== 'active') {return;}

      try {
        await this.executeJob(entry);
      } catch (error) {
        this.logger.error('Cron job execution failed', error as Error, {
          id: entry.id,
        });
      }

      // Schedule next run
      entry.nextRun = parseNextRun(entry.schedule);
      this.scheduleNext(entry);
    }, delay);
  }

  /**
   * Execute a cron job.
   */
  private async executeJob(entry: CronEntry): Promise<void> {
    const now = new Date();

    const context: CronContext = {
      jobId: entry.id,
      scheduledAt: entry.nextRun ?? now,
      executedAt: now,
      runCount: entry.runCount + 1,
    };

    this.logger.debug('Executing cron job', { id: entry.id, runCount: context.runCount });

    await entry.handler(context);

    entry.lastRun = now;
    entry.runCount++;

    this.logger.debug('Cron job executed', {
      id: entry.id,
      runCount: entry.runCount,
    });
  }

  /**
   * Stop all cron jobs (for cleanup).
   */
  dispose(): void {
    for (const entry of this.jobs.values()) {
      if (entry.timerId) {
        clearTimeout(entry.timerId);
      }
    }
    this.jobs.clear();
  }

  /**
   * Get stats (for monitoring).
   */
  getStats(): {
    totalJobs: number;
    activeJobs: number;
    pausedJobs: number;
  } {
    let active = 0;
    let paused = 0;

    for (const entry of this.jobs.values()) {
      if (entry.status === 'active') {active++;}
      else {paused++;}
    }

    return {
      totalJobs: this.jobs.size,
      activeJobs: active,
      pausedJobs: paused,
    };
  }
}
