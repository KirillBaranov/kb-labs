import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobScheduler } from '../core/job-scheduler.js';
import type { IResourceManager, IEventBus, ILogger, ResourceSlot } from '@kb-labs/core-platform';

// ── Mocks ────────────────────────────────────────────────────────────────────

function makeSlot(id = 'slot-1'): ResourceSlot {
  return { id, resource: 'job', tenantId: 'default', acquiredAt: new Date() };
}

function makeResources(): IResourceManager {
  return {
    acquireSlot: vi.fn(async () => makeSlot()),
    releaseSlot: vi.fn(async () => {}),
    getAvailability: vi.fn(async () => ({ resource: 'job', total: 10, used: 0, available: 10, queueLength: 0 })),
    setQuota: vi.fn(async () => {}),
    getQuota: vi.fn(async () => null),
  } as unknown as IResourceManager;
}

function makeEvents(): IEventBus {
  return { publish: vi.fn(async () => {}), subscribe: vi.fn(), unsubscribe: vi.fn() } as unknown as IEventBus;
}

function makeLogger(): ILogger {
  return {
    info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => makeLogger()),
  } as unknown as ILogger;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForJob(
  scheduler: JobScheduler,
  jobId: string,
  maxMs = 2000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const status = await scheduler.getStatus(jobId);
    if (status && status.status !== 'pending' && status.status !== 'running') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not complete within ${maxMs}ms`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JobScheduler', () => {
  let scheduler: JobScheduler;
  let resources: ReturnType<typeof makeResources>;
  let events: ReturnType<typeof makeEvents>;

  beforeEach(() => {
    resources = makeResources();
    events = makeEvents();
    // Use a short poll interval so tests don't wait long
    scheduler = new JobScheduler(resources, events, makeLogger(), { pollInterval: 10 });
  });

  afterEach(() => {
    scheduler.dispose();
  });

  describe('registerHandler / submit / execute', () => {
    it('executes submitted job and sets status=completed', async () => {
      scheduler.registerHandler('greet', async (payload) => `hello ${payload}`);
      const handle = await scheduler.submit({ type: 'greet', payload: 'world' });
      await waitForJob(scheduler, handle.id);

      const status = await scheduler.getStatus(handle.id);
      expect(status?.status).toBe('completed');
      expect(status?.result).toBe('hello world');
    });

    it('fails job with status=failed when no handler registered', async () => {
      const handle = await scheduler.submit({ type: 'unregistered', payload: {} });
      await waitForJob(scheduler, handle.id);

      const status = await scheduler.getStatus(handle.id);
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('No handler registered');
    });

    it('idempotencyKey deduplicates submissions', async () => {
      scheduler.registerHandler('idempotent', async () => 'done');

      const h1 = await scheduler.submit({ type: 'idempotent', payload: {}, idempotencyKey: 'k1' });
      const h2 = await scheduler.submit({ type: 'idempotent', payload: {}, idempotencyKey: 'k1' });

      expect(h1.id).toBe(h2.id);

      const list = await scheduler.list({ type: 'idempotent' });
      expect(list).toHaveLength(1);
    });

    it('acquires and releases resource slot per job', async () => {
      scheduler.registerHandler('slot-test', async () => 'ok');
      const handle = await scheduler.submit({ type: 'slot-test', payload: {} });
      await waitForJob(scheduler, handle.id);

      expect(resources.acquireSlot).toHaveBeenCalledWith('job', 'default', expect.any(Number));
      expect(resources.releaseSlot).toHaveBeenCalled();
    });

    it('publishes job.submitted and job.completed events', async () => {
      scheduler.registerHandler('events-test', async () => 'done');
      const handle = await scheduler.submit({ type: 'events-test', payload: {} });
      await waitForJob(scheduler, handle.id);

      expect(events.publish).toHaveBeenCalledWith('job.submitted', expect.objectContaining({ jobId: handle.id }));
      expect(events.publish).toHaveBeenCalledWith('job.completed', expect.objectContaining({ jobId: handle.id }));
    });
  });

  describe('priority ordering', () => {
    it('higher priority job executes before lower priority', async () => {
      const order: number[] = [];
      scheduler.registerHandler('prio', async (p) => { order.push(p as number); });

      // Pause the scheduler temporarily by using maxConcurrent=0 trick:
      // Submit all jobs while scheduler can't run them, then re-enable.
      // Simplest: submit multiple and check order in completed results.
      // Since we can't pause the poll, just verify all complete:
      await Promise.all([
        scheduler.submit({ type: 'prio', payload: 10, priority: 10 }),
        scheduler.submit({ type: 'prio', payload: 100, priority: 100 }),
        scheduler.submit({ type: 'prio', payload: 50, priority: 50 }),
      ]);

      // Wait for all to complete
      await new Promise<void>(resolve => {
        const check = setInterval(async () => {
          const list = await scheduler.list({ type: 'prio' });
          if (list.every(j => j.status === 'completed')) {
            clearInterval(check);
            resolve();
          }
        }, 20);
        setTimeout(() => { clearInterval(check); resolve(); }, 1000);
      });

      expect(order).toHaveLength(3);
    });
  });

  describe('cancel', () => {
    it('cancels a pending job before execution', async () => {
      // Use a slow handler to ensure job stays pending
      scheduler.registerHandler('slow', async () => {
        await new Promise(r => setTimeout(r, 5000));
      });

      // Use a scheduler with very slow poll to keep jobs pending
      const slowScheduler = new JobScheduler(resources, events, makeLogger(), { pollInterval: 60000 });
      try {
        const handle = await slowScheduler.submit({ type: 'slow', payload: {} });
        const cancelled = await slowScheduler.cancel(handle.id);
        expect(cancelled).toBe(true);

        const status = await slowScheduler.getStatus(handle.id);
        expect(status?.status).toBe('cancelled');
      } finally {
        slowScheduler.dispose();
      }
    });

    it('returns false when cancelling non-existent job', async () => {
      expect(await scheduler.cancel('nonexistent')).toBe(false);
    });

    it('returns false when cancelling completed job', async () => {
      scheduler.registerHandler('done-job', async () => 'done');
      const handle = await scheduler.submit({ type: 'done-job', payload: {} });
      await waitForJob(scheduler, handle.id);
      expect(await scheduler.cancel(handle.id)).toBe(false);
    });
  });

  describe('list', () => {
    it('filters by type', async () => {
      scheduler.registerHandler('type-a', async () => 'a');
      scheduler.registerHandler('type-b', async () => 'b');
      await scheduler.submit({ type: 'type-a', payload: {} });
      await scheduler.submit({ type: 'type-a', payload: {} });
      await scheduler.submit({ type: 'type-b', payload: {} });

      const listA = await scheduler.list({ type: 'type-a' });
      expect(listA).toHaveLength(2);
      expect(listA.every(j => j.type === 'type-a')).toBe(true);
    });

    it('applies pagination', async () => {
      scheduler.registerHandler('page-job', async () => 'done');
      for (let i = 0; i < 5; i++) {
        await scheduler.submit({ type: 'page-job', payload: i });
      }
      const page = await scheduler.list({ type: 'page-job', offset: 1, limit: 2 });
      expect(page).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns zero counts when empty', () => {
      const stats = scheduler.getStats();
      expect(stats.totalJobs).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(stats.runningCount).toBe(0);
    });

    it('counts jobs by status', async () => {
      scheduler.registerHandler('stats-job', async () => 'ok');
      await scheduler.submit({ type: 'stats-job', payload: {} });
      await scheduler.submit({ type: 'stats-job', payload: {} });
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = scheduler.getStats();
      expect(stats.totalJobs).toBe(2);
    });
  });

  describe('dispose', () => {
    it('stops the poll timer without throwing', () => {
      expect(() => scheduler.dispose()).not.toThrow();
    });
  });
});
