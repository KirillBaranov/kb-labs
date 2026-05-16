import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CronManager } from '../core/cron-manager.js';
import type { ILogger, CronContext } from '@kb-labs/core-platform';

function makeLogger(): ILogger {
  return {
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => makeLogger()),
  } as unknown as ILogger;
}

describe('CronManager', () => {
  let cron: CronManager;

  beforeEach(() => {
    cron = new CronManager(makeLogger());
  });

  afterEach(() => {
    cron.dispose();
  });

  // ── register / list / unregister ────────────────────────────────────────────

  describe('register / list / unregister', () => {
    it('registers a job and appears in list()', () => {
      cron.register('job1', '@daily', vi.fn());
      const jobs = cron.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.id).toBe('job1');
      expect(jobs[0]!.status).toBe('active');
      expect(jobs[0]!.runCount).toBe(0);
    });

    it('re-registers clears the old job', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      cron.register('my-job', '@hourly', handler1);
      cron.register('my-job', '@daily', handler2); // re-register with different schedule

      const jobs = cron.list();
      expect(jobs).toHaveLength(1); // only one entry
      expect(jobs[0]!.schedule).toBe('@daily');
    });

    it('unregister removes job from list', () => {
      cron.register('rm-job', '@hourly', vi.fn());
      cron.unregister('rm-job');
      expect(cron.list()).toHaveLength(0);
    });

    it('unregister on nonexistent id is a no-op', () => {
      expect(() => cron.unregister('does-not-exist')).not.toThrow();
    });
  });

  // ── trigger (manual execution) ────────────────────────────────────────────

  describe('trigger', () => {
    it('executes the handler immediately', async () => {
      const contexts: CronContext[] = [];
      cron.register('triggered', '@daily', async (ctx) => { contexts.push(ctx); });
      await cron.trigger('triggered');
      expect(contexts).toHaveLength(1);
      expect(contexts[0]!.jobId).toBe('triggered');
      expect(contexts[0]!.runCount).toBe(1);
    });

    it('increments runCount on each trigger', async () => {
      const handler = vi.fn();
      cron.register('counter', '@daily', handler);
      await cron.trigger('counter');
      await cron.trigger('counter');
      await cron.trigger('counter');
      expect(handler).toHaveBeenCalledTimes(3);

      const job = cron.list().find(j => j.id === 'counter');
      expect(job?.runCount).toBe(3);
    });

    it('updates lastRun after trigger', async () => {
      cron.register('lastrun-job', '@daily', vi.fn());
      const before = new Date();
      await cron.trigger('lastrun-job');
      const job = cron.list().find(j => j.id === 'lastrun-job');
      expect(job?.lastRun).toBeDefined();
      expect(job!.lastRun!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws for nonexistent job', async () => {
      await expect(cron.trigger('ghost')).rejects.toThrow('Cron job not found: ghost');
    });
  });

  // ── pause / resume ─────────────────────────────────────────────────────────

  describe('pause / resume', () => {
    it('pause sets status to paused', () => {
      cron.register('pause-me', '@daily', vi.fn());
      cron.pause('pause-me');
      const job = cron.list().find(j => j.id === 'pause-me');
      expect(job?.status).toBe('paused');
    });

    it('paused job can still be triggered manually', async () => {
      const handler = vi.fn();
      cron.register('paused-trigger', '@daily', handler);
      cron.pause('paused-trigger');
      await cron.trigger('paused-trigger');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('resume sets status back to active', () => {
      cron.register('resume-me', '@daily', vi.fn());
      cron.pause('resume-me');
      cron.resume('resume-me');
      const job = cron.list().find(j => j.id === 'resume-me');
      expect(job?.status).toBe('active');
    });

    it('resume recalculates nextRun', () => {
      cron.register('resume-time', '@hourly', vi.fn());
      const beforePause = cron.list()[0]!.nextRun;
      cron.pause('resume-time');
      cron.resume('resume-time');
      const afterResume = cron.list()[0]!.nextRun;
      // nextRun should be in the future (> now), both times
      expect(beforePause).toBeDefined();
      expect(afterResume).toBeDefined();
      expect(afterResume!.getTime()).toBeGreaterThan(Date.now());
    });

    it('pause on nonexistent id is a no-op', () => {
      expect(() => cron.pause('no-such-job')).not.toThrow();
    });

    it('resume on non-paused job is a no-op', () => {
      cron.register('active-job', '@daily', vi.fn());
      expect(() => cron.resume('active-job')).not.toThrow();
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeros when empty', () => {
      const stats = cron.getStats();
      expect(stats.totalJobs).toBe(0);
      expect(stats.activeJobs).toBe(0);
      expect(stats.pausedJobs).toBe(0);
    });

    it('counts active and paused jobs correctly', () => {
      cron.register('a1', '@daily', vi.fn());
      cron.register('a2', '@hourly', vi.fn());
      cron.register('p1', '@weekly', vi.fn());
      cron.pause('p1');

      const stats = cron.getStats();
      expect(stats.totalJobs).toBe(3);
      expect(stats.activeJobs).toBe(2);
      expect(stats.pausedJobs).toBe(1);
    });
  });

  // ── dispose ────────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('clears all jobs without throwing', () => {
      cron.register('job-a', '@daily', vi.fn());
      cron.register('job-b', '@hourly', vi.fn());
      expect(() => cron.dispose()).not.toThrow();
      expect(cron.list()).toHaveLength(0);
    });
  });

  // ── parseNextRun (via list after register) ────────────────────────────────

  describe('schedule parsing (nextRun)', () => {
    function nextRunFor(schedule: string): Date {
      const id = `test-${schedule}`;
      cron.register(id, schedule as never, vi.fn());
      const nextRun = cron.list().find(j => j.id === id)!.nextRun!;
      cron.unregister(id);
      return nextRun;
    }

    it('@hourly → next run is in the future', () => {
      const next = nextRunFor('@hourly');
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('@daily → next run is tomorrow midnight', () => {
      const next = nextRunFor('@daily');
      expect(next.getTime()).toBeGreaterThan(Date.now());
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(0);
    });

    it('@weekly → next run is in the future', () => {
      const next = nextRunFor('@weekly');
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it('@monthly → next run starts at day 1', () => {
      const next = nextRunFor('@monthly');
      expect(next.getDate()).toBe(1);
      expect(next.getHours()).toBe(0);
    });

    it('@yearly → next run is next year', () => {
      const next = nextRunFor('@yearly');
      expect(next.getFullYear()).toBeGreaterThan(new Date().getFullYear());
    });

    it('cron "*/30 * * * *" → next run within 30 minutes', () => {
      const next = nextRunFor('*/30 * * * *');
      const diffMinutes = (next.getTime() - Date.now()) / 60000;
      expect(diffMinutes).toBeGreaterThan(0);
      expect(diffMinutes).toBeLessThanOrEqual(30);
    });
  });
});
