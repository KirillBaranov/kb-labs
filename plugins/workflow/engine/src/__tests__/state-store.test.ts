import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore } from '../state-store.js';
import type { WorkflowRun, JobRun } from '@kb-labs/workflow-contracts';
import type { ICache } from '@kb-labs/core-platform';
import { mockLogger } from '@kb-labs/shared-testing';

class MockCache implements ICache {
  private store = new Map<string, any>();
  async get<T>(key: string): Promise<T | null> { return this.store.get(key) ?? null; }
  async set<T>(key: string, value: T): Promise<void> { this.store.set(key, value); }
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

  // ── resetStepsFromIndex ──────────────────────────────────────────────

  function makeRunWithSteps(): WorkflowRun {
    const now = '2026-01-01T00:00:00Z';
    return {
      id: 'run-r',
      name: 'resume-workflow',
      version: '1.0.0',
      status: 'failed',
      createdAt: now,
      queuedAt: now,
      trigger: { type: 'manual' },
      jobs: [
        {
          id: 'run-r:build',
          jobName: 'build',
          status: 'failed',
          startedAt: now,
          finishedAt: now,
          durationMs: 5000,
          steps: [
            {
              id: 'run-r:build:0',
              name: 'checkout',
              index: 0,
              status: 'success',
              startedAt: now,
              finishedAt: now,
              outputs: { sha: 'abc123' },
              spec: { id: 'checkout', uses: 'builtin:shell', run: 'echo ok' },
            },
            {
              id: 'run-r:build:1',
              name: 'compile',
              index: 1,
              status: 'success',
              startedAt: now,
              finishedAt: now,
              outputs: { artifact: 'dist/app.js' },
              spec: { id: 'compile', uses: 'builtin:shell', run: 'tsc' },
            },
            {
              id: 'run-r:build:2',
              name: 'test',
              index: 2,
              status: 'failed',
              startedAt: now,
              finishedAt: now,
              error: { message: 'Tests failed', code: 'TESTS_FAILED' },
              spec: { id: 'test', uses: 'builtin:shell', run: 'vitest' },
            },
            {
              id: 'run-r:build:3',
              name: 'deploy',
              index: 3,
              status: 'queued',
              spec: { id: 'deploy', uses: 'builtin:shell', run: 'deploy.sh' },
            },
          ],
        } as unknown as JobRun,
      ],
    } as WorkflowRun;
  }

  it('SSR-01: resets steps from fromIndex onward, preserves steps before', async () => {
    const run = makeRunWithSteps();
    await store.saveRun(run);

    await store.resetStepsFromIndex('run-r', 'run-r:build', 2);

    const reloaded = await store.getRun('run-r');
    const steps = reloaded!.jobs[0]!.steps;

    // Steps 0 and 1 are unchanged
    expect(steps[0]!.status).toBe('success');
    expect(steps[0]!.outputs).toEqual({ sha: 'abc123' });
    expect(steps[0]!.finishedAt).toBe('2026-01-01T00:00:00Z');

    expect(steps[1]!.status).toBe('success');
    expect(steps[1]!.outputs).toEqual({ artifact: 'dist/app.js' });

    // Steps 2 and 3 are reset
    expect(steps[2]!.status).toBe('queued');
    expect(steps[2]!.startedAt).toBeUndefined();
    expect(steps[2]!.finishedAt).toBeUndefined();
    expect(steps[2]!.error).toBeUndefined();
    expect(steps[2]!.outputs).toBeUndefined();

    expect(steps[3]!.status).toBe('queued');
  });

  it('SSR-02: resets job status and clears timing', async () => {
    const run = makeRunWithSteps();
    await store.saveRun(run);

    await store.resetStepsFromIndex('run-r', 'run-r:build', 2);

    const reloaded = await store.getRun('run-r');
    const job = reloaded!.jobs[0]!;

    expect(job.status).toBe('queued');
    expect(job.startedAt).toBeUndefined();
    expect(job.finishedAt).toBeUndefined();
    expect(job.durationMs).toBeUndefined();
    expect(job.error).toBeUndefined();
  });

  it('SSR-03: resetting from index 0 resets all steps', async () => {
    const run = makeRunWithSteps();
    await store.saveRun(run);

    await store.resetStepsFromIndex('run-r', 'run-r:build', 0);

    const reloaded = await store.getRun('run-r');
    const steps = reloaded!.jobs[0]!.steps;

    for (const step of steps) {
      expect(step.status).toBe('queued');
      expect(step.outputs).toBeUndefined();
    }
  });

  it('SSR-04: returns null for non-existent run', async () => {
    const result = await store.resetStepsFromIndex('ghost-run', 'job-id', 0);
    expect(result).toBeNull();
  });
});
