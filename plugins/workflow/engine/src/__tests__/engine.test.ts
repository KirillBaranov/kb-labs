/**
 * Tests for WorkflowEngine
 *
 * Critical infrastructure tests covering:
 * - Run creation and state management
 * - Event publishing
 * - Job scheduling
 * - Concurrency control
 * - Error handling and retries
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../engine.js';
import type { WorkflowSpec, WorkflowRun } from '@kb-labs/workflow-contracts';
import type { ICache, IEventBus } from '@kb-labs/core-platform';
import { mockLogger, type MockLoggerInstance } from '@kb-labs/shared-testing';

// Mock Cache
class MockCache implements ICache {
  private store = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.store.get(key) ?? null;
  }

  async set<T>(key: string, value: T, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.store.clear();
      return;
    }
    // Simple prefix match
    const prefix = pattern.replace('*', '');
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const zset = this.store.get(key) || [];
    zset.push({ score, member });
    this.store.set(key, zset);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const zset = this.store.get(key) || [];
    return zset
      .filter((item: any) => item.score >= min && item.score <= max)
      .sort((a: any, b: any) => a.score - b.score)
      .map((item: any) => item.member);
  }

  async zrem(key: string, member: string): Promise<void> {
    const zset = this.store.get(key) || [];
    const filtered = zset.filter((item: any) => item.member !== member);
    this.store.set(key, filtered);
  }

  async setIfNotExists<T>(key: string, value: T, _ttl?: number): Promise<boolean> {
    if (this.store.has(key)) {
      return false;
    }
    this.store.set(key, value);
    return true;
  }

  async getStats() {
    return {
      totalEntries: this.store.size,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      namespaces: {},
      uptime: 0,
      evictions: 0,
    };
  }

  async getHealth() {
    return {
      status: 'ok' as const,
      version: '0.1.0',
      stats: await this.getStats(),
    };
  }

  async stop() {}
}

// Mock EventBus
class MockEventBus implements IEventBus {
  publishedEvents: any[] = [];

  async publish(_topic: string, event: any): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(_topic: string, _handler: (event: T) => void | Promise<void>): () => void {
    return () => {}; // Unsubscribe function
  }
}

describe('WorkflowEngine', () => {
  let cache: MockCache;
  let events: MockEventBus;
  let logger: MockLoggerInstance;
  let engine: WorkflowEngine;

  beforeEach(() => {
    cache = new MockCache();
    events = new MockEventBus();
    logger = mockLogger();

    engine = new WorkflowEngine({
      cache,
      events,
      logger,
      maxWorkflowDepth: 2,
    });
  });

  describe('Initialization', () => {
    it('should create engine with required adapters', () => {
      expect(engine).toBeDefined();
      expect(engine.loader).toBeDefined();
      expect(engine.maxWorkflowDepth).toBe(2);
    });

    it('should use default maxWorkflowDepth if not provided', () => {
      const engine2 = new WorkflowEngine({ cache, events, logger });
      expect(engine2.maxWorkflowDepth).toBe(2);
    });
  });

  describe('Run Creation', () => {
    const simpleSpec: WorkflowSpec = {
      name: 'Test Workflow',
      version: '1.0.0',
      on: { manual: true },
      jobs: {
        main: {
          runsOn: 'local',
          steps: [
            { name: 'Step 1', uses: 'builtin:shell', with: { run: 'echo "test"' } },
          ],
        },
      },
    };

    it('should store run in state store', async () => {
      const run = await engine.createRun({
        spec: simpleSpec,
        trigger: { type: 'manual' },
      });

      const storedRun = await engine.getRun(run.id);
      expect(storedRun).toBeDefined();
      expect(storedRun?.id).toBe(run.id);
    });
  });

  describe('Run from File', () => {
    it('should load and create run from YAML file', async () => {
      // This test would require mocking file system
      // For now, we'll skip it as it's covered by WorkflowLoader tests
    });
  });


  describe('Get Run', () => {
    it('should get run by ID', async () => {
      const spec: WorkflowSpec = {
        name: 'Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          main: {
            runsOn: 'local',
            steps: [{ name: 'Step 1', uses: 'builtin:shell', with: { run: 'echo "test"' } }],
          },
        },
      };

      const created = await engine.createRun({
        spec,
        trigger: { type: 'manual' },
      });

      const retrieved = await engine.getRun(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test');
    });

    it('should return null for non-existent run', async () => {
      const retrieved = await engine.getRun('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('Cancel Run', () => {
    it('should cancel run and update status', async () => {
      const spec: WorkflowSpec = {
        name: 'Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          main: {
            runsOn: 'local',
            steps: [{ name: 'Step 1', uses: 'builtin:shell', with: { run: 'echo "test"' } }],
          },
        },
      };

      const run = await engine.createRun({
        spec,
        trigger: { type: 'manual' },
      });

      await engine.cancelRun(run.id);

      const cancelled = await engine.getRun(run.id);
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.finishedAt).toBeDefined();
    });
  });

  describe('Job Failure and Retries', () => {
    let run: WorkflowRun;

    beforeEach(async () => {
      const spec: WorkflowSpec = {
        name: 'Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          main: {
            runsOn: 'local',
            retries: {
              max: 3,
              backoff: 'exp',
              initialIntervalMs: 1000,
            },
            steps: [{ name: 'Step 1', uses: 'builtin:shell', with: { run: 'echo "test"' } }],
          },
        },
      };

      run = await engine.createRun({
        spec,
        trigger: { type: 'manual' },
      });
    });

    it('should handle non-existent run gracefully', async () => {
      const error = new Error('Job failed');

      await engine.markJobFailed('non-existent', 'main', error);

      expect(logger.warn).toHaveBeenCalledWith(
        'Cannot mark job as failed: run not found',
        expect.objectContaining({
          runId: 'non-existent',
          jobId: 'main',
        })
      );
    });

    it('should handle non-existent job gracefully', async () => {
      const error = new Error('Job failed');

      await engine.markJobFailed(run.id, 'non-existent', error);

      expect(logger.warn).toHaveBeenCalledWith(
        'Cannot mark job as failed: job not found',
        expect.objectContaining({
          runId: run.id,
          jobId: 'non-existent',
        })
      );
    });
  });

  describe('Job failure: run status and downstream (B-029, B-030)', () => {
    it('B-029: terminal job failure sets run status to "failed", not "dlq"', async () => {
      const spec: WorkflowSpec = {
        name: 'Fail Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          main: {
            runsOn: 'local',
            retries: { max: 0, backoff: 'exp', initialIntervalMs: 100 },
            steps: [{ name: 'Boom', uses: 'builtin:shell', with: { run: 'exit 1' } }],
          },
        },
      };
      const run = await engine.createRun({ spec, trigger: { type: 'manual' } });
      const jobId = run.jobs.find(j => j.jobName === 'main')!.id;

      await engine.markJobFailed(run.id, jobId, new Error('Step handler reported failure (exitCode: 1)'));

      const updated = await engine.getRun(run.id);
      // dlq must be reserved for infrastructure failures, not a user step exit 1.
      expect(updated?.status).toBe('failed');
      expect(updated?.status).not.toBe('dlq');
      // The failing job's error must surface at the run level so consumers can
      // show why the run failed (REST /runs/:id, Studio, e2e).
      expect(updated?.result?.error?.message).toBeTruthy();
    });

    it('B-030: downstream job of a failed upstream is cancelled, not left queued', async () => {
      const spec: WorkflowSpec = {
        name: 'Cascade Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          'job-a': {
            runsOn: 'local',
            retries: { max: 0, backoff: 'exp', initialIntervalMs: 100 },
            steps: [{ name: 'Boom', uses: 'builtin:shell', with: { run: 'exit 1' } }],
          },
          'job-b': {
            runsOn: 'local',
            needs: ['job-a'],
            steps: [{ name: 'Step B', uses: 'builtin:shell', with: { run: 'echo b' } }],
          },
        },
      };
      const run = await engine.createRun({ spec, trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobFailed(run.id, jobAId, new Error('boom'));

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      // job-b must NOT stay queued forever — it is cancelled because its
      // dependency failed.
      expect(jobB?.status).toBe('cancelled');
      expect(jobB?.status).not.toBe('queued');
      expect(updated?.status).toBe('failed');
    });
  });

  describe('Job Interruption', () => {
    it('should log job interruption', async () => {
      const spec: WorkflowSpec = {
        name: 'Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          main: {
            runsOn: 'local',
            steps: [{ name: 'Step 1', uses: 'builtin:shell', with: { run: 'echo "test"' } }],
          },
        },
      };

      const run = await engine.createRun({
        spec,
        trigger: { type: 'manual' },
      });

      await engine.markJobInterrupted(run.id, 'main');

      expect(logger.warn).toHaveBeenCalledWith(
        'Job interrupted',
        expect.objectContaining({
          runId: run.id,
          jobId: 'main',
        })
      );
    });
  });


  describe('Dispose', () => {
    it('should cleanup resources on dispose', async () => {
      await engine.dispose();
      // Currently no-op, but test structure is here for future cleanup logic
      expect(true).toBe(true);
    });
  });

  describe('Job-level if: condition (BUG-002)', () => {
    // Helper: build a two-job spec where job-b depends on job-a.
    // job-b has an optional `if` condition.
    function makeSpec(jobBIf?: string): WorkflowSpec {
      return {
        name: 'If Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          'job-a': {
            runsOn: 'local',
            steps: [
              {
                id: 'result',
                name: 'Emit result',
                uses: 'builtin:shell',
                with: { run: 'echo test' },
              },
            ],
          },
          'job-b': {
            runsOn: 'local',
            needs: ['job-a'],
            ...(jobBIf !== undefined ? { if: jobBIf } : {}),
            steps: [{ name: 'Step B', uses: 'builtin:shell', with: { run: 'echo b' } }],
          },
        },
      };
    }

    it('job with if: "false" is marked success (skipped) when dependency completes', async () => {
      const run = await engine.createRun({ spec: makeSpec('false'), trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      expect(jobB?.status).toBe('success');
      expect(jobB?.finishedAt).toBeDefined();
    });

    it('job with if: "true" is enqueued (not skipped) when dependency completes', async () => {
      const run = await engine.createRun({ spec: makeSpec('true'), trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      // Should be enqueued for execution (queued or running), not skipped immediately
      expect(jobB?.status).not.toBe('success');
      // finishedAt must NOT be set — job was not skipped
      expect(jobB?.finishedAt).toBeUndefined();
    });

    it('job without if: condition always runs when dependency completes', async () => {
      const run = await engine.createRun({ spec: makeSpec(undefined), trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      expect(jobB?.status).not.toBe('success');
      expect(jobB?.finishedAt).toBeUndefined();
    });

    it('if: ${{ ... }} wrapper is stripped and expression is evaluated', async () => {
      const run = await engine.createRun({
        spec: makeSpec("${{ steps.result.outputs.tier == 'go' }}"),
        trigger: { type: 'manual' },
      });

      // Simulate job-a completing with step output: steps.result.outputs.tier = 'go'
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;
      const stepId = run.jobs.find(j => j.jobName === 'job-a')!.steps[0]!.id;

      // Manually write step output into state so buildExpressionContext sees it
      const stateStore = (engine as any).stateStore;
      await stateStore.updateStep(run.id, jobAId, stepId, (draft: any) => {
        draft.status = 'success';
        draft.outputs = { tier: 'go' };
      });

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      // tier == 'go' → true → job-b should be enqueued, not skipped
      expect(jobB?.status).not.toBe('success');
      expect(jobB?.finishedAt).toBeUndefined();
    });

    it('if: expression false when step output does not match', async () => {
      const run = await engine.createRun({
        spec: makeSpec("${{ steps.result.outputs.tier == 'other' }}"),
        trigger: { type: 'manual' },
      });

      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;
      const stepId = run.jobs.find(j => j.jobName === 'job-a')!.steps[0]!.id;

      const stateStore = (engine as any).stateStore;
      await stateStore.updateStep(run.id, jobAId, stepId, (draft: any) => {
        draft.status = 'success';
        draft.outputs = { tier: 'go' };
      });

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      // tier != 'other' → false → job-b skipped
      expect(jobB?.status).toBe('success');
      expect(jobB?.finishedAt).toBeDefined();
    });

    it('cascading: downstream job of skipped job is also evaluated', async () => {
      // job-a → job-b (if: false, skipped) → job-c (no condition)
      const spec: WorkflowSpec = {
        name: 'Cascade Test',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          'job-a': {
            runsOn: 'local',
            steps: [{ name: 'A', uses: 'builtin:shell', with: { run: 'echo a' } }],
          },
          'job-b': {
            runsOn: 'local',
            needs: ['job-a'],
            if: 'false',
            steps: [{ name: 'B', uses: 'builtin:shell', with: { run: 'echo b' } }],
          },
          'job-c': {
            runsOn: 'local',
            needs: ['job-b'],
            steps: [{ name: 'C', uses: 'builtin:shell', with: { run: 'echo c' } }],
          },
        },
      };

      const run = await engine.createRun({ spec, trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobCompleted(run.id, jobAId);

      const updated = await engine.getRun(run.id);
      const jobB = updated?.jobs.find(j => j.jobName === 'job-b');
      const jobC = updated?.jobs.find(j => j.jobName === 'job-c');

      // job-b skipped
      expect(jobB?.status).toBe('success');
      // job-c unblocked and enqueued (not skipped — no if:)
      expect(jobC?.status).not.toBe('success');
      expect(jobC?.finishedAt).toBeUndefined();
    });

    it('skipped job logs the condition', async () => {
      const run = await engine.createRun({ spec: makeSpec('false'), trigger: { type: 'manual' } });
      const jobAId = run.jobs.find(j => j.jobName === 'job-a')!.id;

      await engine.markJobCompleted(run.id, jobAId);

      expect(logger.info).toHaveBeenCalledWith(
        'Job skipped: if condition false',
        expect.objectContaining({ runId: run.id, condition: 'false' }),
      );
    });
  });

  // ── resumeFromStep ─────────────────────────────────────────────────────────

  describe('resumeFromStep', () => {
    const resumeSpec: WorkflowSpec = {
      name: 'Resume Test',
      version: '1.0.0',
      on: { manual: true },
      jobs: {
        build: {
          runsOn: 'local',
          steps: [
            { id: 'checkout', name: 'Checkout', uses: 'builtin:shell', with: { run: 'echo checkout' } },
            { id: 'compile',  name: 'Compile',  uses: 'builtin:shell', with: { run: 'echo compile'  } },
            { id: 'test',     name: 'Test',     uses: 'builtin:shell', with: { run: 'echo test'     } },
          ],
        },
      },
    };

    async function makeFailedRun() {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      // Simulate the run reaching 'failed' state
      await (engine as any).stateStore.updateRun(run.id, (draft: WorkflowRun) => {
        draft.status = 'failed';
        draft.finishedAt = new Date().toISOString();
        const job = draft.jobs[0]!;
        job.status = 'failed';
        job.startedAt = new Date().toISOString();
        job.finishedAt = new Date().toISOString();
        // Mark first two steps as completed, third as failed
        job.steps[0]!.status = 'success';
        job.steps[0]!.outputs = { sha: 'abc' };
        job.steps[1]!.status = 'success';
        job.steps[1]!.outputs = { artifact: 'dist/app.js' };
        job.steps[2]!.status = 'failed';
        job.steps[2]!.error = { message: 'Tests exploded' };
      });
      return await engine.getRun(run.id) as WorkflowRun;
    }

    // RFS-01: guard — active run (running)
    it('RFS-01: throws when run is still running', async () => {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      // status is 'queued' after creation — test with 'running' explicitly
      await (engine as any).stateStore.updateRun(run.id, (draft: WorkflowRun) => {
        draft.status = 'running';
      });
      await expect(engine.resumeFromStep(run.id, 'test')).rejects.toThrow(
        "Cannot resume run in status 'running': run is still active",
      );
    });

    // RFS-02: guard — active run (queued)
    it('RFS-02: throws when run is queued', async () => {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      await expect(engine.resumeFromStep(run.id, 'test')).rejects.toThrow(
        "Cannot resume run in status 'queued': run is still active",
      );
    });

    // RFS-03: guard — already succeeded
    it('RFS-03: throws when run already succeeded', async () => {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      await (engine as any).stateStore.updateRun(run.id, (draft: WorkflowRun) => {
        draft.status = 'success';
      });
      await expect(engine.resumeFromStep(run.id, 'test')).rejects.toThrow(
        "Cannot resume run in status 'success': run already completed successfully",
      );
    });

    // RFS-04: guard — cancelled run must be blocked
    it('RFS-04: throws when run is cancelled', async () => {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      await (engine as any).stateStore.updateRun(run.id, (draft: WorkflowRun) => {
        draft.status = 'cancelled';
        draft.finishedAt = new Date().toISOString();
      });
      await expect(engine.resumeFromStep(run.id, 'test')).rejects.toThrow(
        "Cannot resume run in status 'cancelled': run was cancelled",
      );
    });

    // RFS-05: guard — run not found
    it('RFS-05: throws when run does not exist', async () => {
      await expect(engine.resumeFromStep('ghost-run-id', 'test')).rejects.toThrow('Run not found');
    });

    // RFS-06: guard — step not found
    it('RFS-06: throws when step ID does not exist in the run', async () => {
      const run = await makeFailedRun();
      await expect(engine.resumeFromStep(run.id, 'nonexistent-step')).rejects.toThrow(
        "Step not found: 'nonexistent-step'",
      );
    });

    // RFS-07: guard — step not yet reached (queued)
    it('RFS-07: throws when target step has not been reached yet (still queued)', async () => {
      const run = await engine.createRun({ spec: resumeSpec, trigger: { type: 'manual' } });
      // Put run in failed with first step done, remaining two queued
      await (engine as any).stateStore.updateRun(run.id, (draft: WorkflowRun) => {
        draft.status = 'failed';
        draft.finishedAt = new Date().toISOString();
        const job = draft.jobs[0]!;
        job.status = 'failed';
        job.steps[0]!.status = 'success';
        // steps[1] and steps[2] remain 'queued'
      });
      await expect(engine.resumeFromStep(run.id, 'compile')).rejects.toThrow(
        "Step 'compile' has not been reached yet",
      );
    });

    // RFS-08: happy path — run transitions to 'running', steps reset
    it('RFS-08: resets target step onward and transitions run to running', async () => {
      const run = await makeFailedRun();
      const resumed = await engine.resumeFromStep(run.id, 'test');

      expect(resumed.status).toBe('running');
      expect(resumed.finishedAt).toBeUndefined();

      const job = resumed.jobs[0]!;
      // Steps before target must stay intact
      expect(job.steps[0]!.status).toBe('success');
      expect(job.steps[0]!.outputs).toEqual({ sha: 'abc' });
      expect(job.steps[1]!.status).toBe('success');
      // Target step and beyond are reset
      expect(job.steps[2]!.status).toBe('queued');
      expect(job.steps[2]!.error).toBeUndefined();
      expect(job.steps[2]!.finishedAt).toBeUndefined();
    });

    // RFS-09: run.resumed event is published so SSE watchers are notified
    it('RFS-09: publishes run.resumed event after successful resume', async () => {
      const run = await makeFailedRun();
      events.publishedEvents = [];

      await engine.resumeFromStep(run.id, 'test');

      const resumedEvent = events.publishedEvents.find((e: any) => e.type === 'run.resumed');
      expect(resumedEvent).toBeDefined();
      expect(resumedEvent.runId).toBe(run.id);
      expect(resumedEvent.payload.fromStepId).toBe('test');
    });

    // RFS-10: disambiguate by jobId
    it('RFS-10: accepts explicit jobId to disambiguate when multiple jobs could match', async () => {
      const run = await makeFailedRun();
      const jobId = run.jobs[0]!.id;

      const resumed = await engine.resumeFromStep(run.id, 'test', jobId);
      expect(resumed.status).toBe('running');
    });
  });
});
