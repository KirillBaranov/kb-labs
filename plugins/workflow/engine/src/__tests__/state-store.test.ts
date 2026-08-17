import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateStore } from '../state-store.js';
import type { WorkflowRun, JobRun } from '@kb-labs/workflow-contracts';
import type { ICache } from '@kb-labs/core-platform';
import { mockLogger } from '@kb-labs/shared-testing';

class MockCache implements ICache {
  private store = new Map<string, any>();
  async get<T>(key: string): Promise<T | null> { return this.store.get(key) ?? null; }
  async set<T>(key: string, value: T, _ttl?: number): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
  async clear(): Promise<void> { this.store.clear(); }
  async has(key: string): Promise<boolean> { return this.store.has(key); }
  async zadd(key: string, score: number, member: string): Promise<void> {
    const zset = this.store.get(key) || [];
    zset.push({ score, member });
    this.store.set(key, zset);
  }
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const zset = this.store.get(key) || [];
    return zset
      .filter((i: any) => i.score >= min && i.score <= max)
      .sort((a: any, b: any) => a.score - b.score)
      .map((i: any) => i.member);
  }
  async zrem(key: string, member: string): Promise<void> {
    const zset = this.store.get(key) || [];
    this.store.set(key, zset.filter((i: any) => i.member !== member));
  }
  async setIfNotExists<T>(key: string, value: T): Promise<boolean> {
    if (this.store.has(key)) { return false; }
    this.store.set(key, value);
    return true;
  }
  async getStats() { return { totalEntries: 0, totalSize: 0, hitRate: 0, missRate: 0, evictions: 0, status: 'ok' as const }; }
  async getHealth() { return { status: 'ok' as const }; }
  async stop() {}
}


function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    name: 'test-workflow',
    version: '1.0.0',
    status: 'queued',
    createdAt: '2026-01-01T00:00:00Z',
    queuedAt: '2026-01-01T00:00:00Z',
    trigger: { type: 'manual' },
    jobs: [
      {
        id: 'run-1:build',
        jobName: 'build',
        status: 'queued',
        steps: [
          { id: 'run-1:build:0', name: 'compile', index: 0, status: 'queued' },
          { id: 'run-1:build:1', name: 'test', index: 1, status: 'queued' },
        ],
      } as JobRun,
    ],
    ...overrides,
  } as WorkflowRun;
}

describe('StateStore', () => {
  let cache: MockCache;
  let store: StateStore;

  beforeEach(() => {
    cache = new MockCache();
    store = new StateStore(cache, mockLogger());
  });

  // ── saveRun / getRun ─────────────────────────────────────────────────

  it('saves and retrieves a workflow run', async () => {
    const run = makeRun();
    await store.saveRun(run);

    const loaded = await store.getRun('run-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('run-1');
    expect(loaded!.name).toBe('test-workflow');
    expect(loaded!.jobs).toHaveLength(1);
    expect(loaded!.jobs[0]!.steps).toHaveLength(2);
  });

  it('returns null for non-existent run', async () => {
    const result = await store.getRun('nonexistent');
    expect(result).toBeNull();
  });

  it('regression: saveRun always passes an explicit, long TTL to cache.set — ' +
    'omitting it (as the code used to) falls back to the cache backend\'s own ' +
    'ephemeral-cache default (e.g. InMemoryStateBroker: 300_000ms / 5min), so a ' +
    'run in the middle of a long-running step (release checks can run 20-35min) ' +
    'silently expires mid-flight and its real result never gets persisted', async () => {
    const setSpy = vi.spyOn(cache, 'set');
    await store.saveRun(makeRun());

    expect(setSpy).toHaveBeenCalledOnce();
    const ttl = setSpy.mock.calls[0]?.[2];
    expect(ttl).toBeDefined();
    // Must comfortably outlive the slowest known workflow step (~35min for
    // release checks); assert it's at least an hour so this doesn't become
    // a brittle exact-value check.
    expect(ttl as number).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  // ── deleteRun ────────────────────────────────────────────────────────

  it('deletes a run', async () => {
    await store.saveRun(makeRun());
    await store.deleteRun('run-1');

    const result = await store.getRun('run-1');
    expect(result).toBeNull();
  });

  // ── getAllRunIds ──────────────────────────────────────────────────────

  it('returns all run IDs in order', async () => {
    await store.saveRun(makeRun({ id: 'run-a', createdAt: '2026-01-01T00:00:00Z' }));
    await store.saveRun(makeRun({ id: 'run-b', createdAt: '2026-01-02T00:00:00Z' }));

    const ids = await store.getAllRunIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain('run-a');
    expect(ids).toContain('run-b');
  });

  // ── updateRun ────────────────────────────────────────────────────────

  it('updates run status atomically', async () => {
    await store.saveRun(makeRun());

    const updated = await store.updateRun('run-1', (draft) => {
      draft.status = 'running';
      draft.startedAt = '2026-01-01T00:01:00Z';
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('running');
    expect(updated!.startedAt).toBe('2026-01-01T00:01:00Z');

    // Verify persisted
    const reloaded = await store.getRun('run-1');
    expect(reloaded!.status).toBe('running');
  });

  it('updateRun returns null for non-existent run', async () => {
    const result = await store.updateRun('ghost', () => {});
    expect(result).toBeNull();
  });

  it('regression: two concurrent updateRun calls on the same run do not lose ' +
    'either mutation — the write lock serializes them so the second call ' +
    'reads the first call\'s result before applying its own change. Without ' +
    'the lock, both calls would read the same stale copy, and whichever ' +
    'saves last would silently discard the other\'s write (the exact class ' +
    'of bug this rework closes: a job\'s status write and a step\'s status ' +
    'write to the same run racing and one clobbering the other).', async () => {
    await store.saveRun(makeRun());

    const [a, b] = await Promise.all([
      store.updateRun('run-1', (draft) => {
        draft.env = { ...(draft.env ?? {}), a: 'true' };
      }),
      store.updateRun('run-1', (draft) => {
        draft.env = { ...(draft.env ?? {}), b: 'true' };
      }),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const final = await store.getRun('run-1');
    expect(final!.env).toEqual({ a: 'true', b: 'true' });
  });

  it('updateRun releases its lock so a subsequent call is not stuck waiting', async () => {
    await store.saveRun(makeRun());

    await store.updateRun('run-1', (draft) => { draft.status = 'running'; });
    const second = await store.updateRun('run-1', (draft) => { draft.status = 'success'; });

    expect(second!.status).toBe('success');
  });

  // ── transitionRun / transitionJob / transitionStep ─────────────────────

  it('transitionRun applies a legal transition and extra field mutations', async () => {
    await store.saveRun(makeRun());

    const updated = await store.transitionRun('run-1', 'running', (draft) => {
      draft.startedAt = '2026-01-01T00:01:00Z';
    });

    expect(updated!.status).toBe('running');
    expect(updated!.startedAt).toBe('2026-01-01T00:01:00Z');
  });

  it('transitionRun rejects an illegal transition and leaves the record untouched', async () => {
    await store.saveRun(makeRun({ status: 'failed' }));

    await expect(store.transitionRun('run-1', 'running')).rejects.toThrow(/Illegal run status transition/);

    const reloaded = await store.getRun('run-1');
    expect(reloaded!.status).toBe('failed');
  });

  it('transitionJob applies a legal transition', async () => {
    await store.saveRun(makeRun());

    const updated = await store.transitionJob('run-1', 'run-1:build', 'running');
    expect(updated!.status).toBe('running');
  });

  it('transitionJob rejects an illegal transition', async () => {
    const run = makeRun();
    run.jobs[0]!.status = 'success';
    await store.saveRun(run);

    await expect(store.transitionJob('run-1', 'run-1:build', 'running'))
      .rejects.toThrow(/Illegal job status transition/);
  });

  it('transitionStep applies a legal transition', async () => {
    await store.saveRun(makeRun());

    const updated = await store.transitionStep('run-1', 'run-1:build', 'run-1:build:0', 'running');
    expect(updated!.status).toBe('running');
  });

  it('transitionStep rejects an illegal transition', async () => {
    const run = makeRun();
    run.jobs[0]!.steps[0]!.status = 'failed';
    await store.saveRun(run);

    await expect(store.transitionStep('run-1', 'run-1:build', 'run-1:build:0', 'success'))
      .rejects.toThrow(/Illegal step status transition/);
  });

  // ── updateJob ────────────────────────────────────────────────────────

  it('updates a specific job within a run', async () => {
    await store.saveRun(makeRun());

    const updated = await store.updateJob('run-1', 'run-1:build', (job) => {
      job.status = 'running';
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('running');

    const run = await store.getRun('run-1');
    expect(run!.jobs[0]!.status).toBe('running');
  });

  it('updateJob returns null for non-existent job', async () => {
    await store.saveRun(makeRun());
    const result = await store.updateJob('run-1', 'run-1:ghost', () => {});
    expect(result).toBeNull();
  });

  // ── updateStep ───────────────────────────────────────────────────────

  it('updates a specific step within a job', async () => {
    await store.saveRun(makeRun());

    const updated = await store.updateStep('run-1', 'run-1:build', 'run-1:build:0', (step) => {
      step.status = 'success';
      step.outputs = { compiled: true };
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('success');
    expect(updated!.outputs).toEqual({ compiled: true });
  });

  it('updateStep returns null for non-existent step', async () => {
    await store.saveRun(makeRun());
    const result = await store.updateStep('run-1', 'run-1:build', 'run-1:build:99', () => {});
    expect(result).toBeNull();
  });

  // ── releaseBlockedJobs ───────────────────────────────────────────────

  it('releases blocked jobs when dependency completes', async () => {
    const run = makeRun({
      jobs: [
        {
          id: 'run-1:setup',
          jobName: 'setup',
          status: 'success',
          steps: [],
        } as unknown as JobRun,
        {
          id: 'run-1:test',
          jobName: 'test',
          status: 'queued',
          blocked: true,
          needs: ['setup'],
          pendingDependencies: ['setup'],
          steps: [],
        } as unknown as JobRun,
      ],
    });
    await store.saveRun(run);

    const released = await store.releaseBlockedJobs('run-1', 'setup');

    expect(released).toHaveLength(1);
    expect(released[0]!.jobName).toBe('test');
    expect(released[0]!.blocked).toBe(false);
  });

  it('regression: does not double-report a released job when its mutator runs ' +
    'more than once per call (simulates the CAS-retry loop landing in a later ' +
    'phase: a discarded attempt against stale data, then a real retry against ' +
    'a fresh read). Before the fix, `released` was accumulated in a variable ' +
    'captured once outside the mutator, so every invocation pushed into the ' +
    'same array — a retried call double-counted the same job, and callers ' +
    '(markJobCompleted/skipJob) would then enqueue/skip it twice.', async () => {
    const run = makeRun({
      jobs: [
        { id: 'run-1:setup', jobName: 'setup', status: 'success', steps: [] } as unknown as JobRun,
        {
          id: 'run-1:test',
          jobName: 'test',
          status: 'queued',
          blocked: true,
          needs: ['setup'],
          pendingDependencies: ['setup'],
          steps: [],
        } as unknown as JobRun,
      ],
    });
    await store.saveRun(run);

    const originalUpdateRun = store.updateRun.bind(store);
    const updateRunSpy = vi.spyOn(store, 'updateRun').mockImplementationOnce(async (runId, mutator) => {
      // Discarded first attempt: mutator runs against a draft that never gets
      // saved (as if a concurrent writer won the race and this write was
      // rejected) — exactly what a CAS-conflict retry does before its real,
      // successful attempt.
      const discarded = structuredClone((await store.getRun(runId))!);
      mutator(discarded);
      return originalUpdateRun(runId, mutator);
    });

    const released = await store.releaseBlockedJobs('run-1', 'setup');
    updateRunSpy.mockRestore();

    expect(released).toHaveLength(1);
    expect(released[0]!.jobName).toBe('test');
  });

  it('does not release jobs with remaining dependencies', async () => {
    const run = makeRun({
      jobs: [
        {
          id: 'run-1:deploy',
          jobName: 'deploy',
          status: 'queued',
          blocked: true,
          needs: ['build', 'test'],
          pendingDependencies: ['build', 'test'],
          steps: [],
        } as unknown as JobRun,
      ],
    });
    await store.saveRun(run);

    const released = await store.releaseBlockedJobs('run-1', 'build');

    // Still blocked because 'test' is pending
    expect(released).toHaveLength(0);

    // But pendingDependencies should be reduced
    const reloaded = await store.getRun('run-1');
    expect(reloaded!.jobs[0]!.pendingDependencies).toEqual(['test']);
  });
});
