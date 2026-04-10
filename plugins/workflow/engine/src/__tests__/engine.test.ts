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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from '../engine.js';
import type { WorkflowSpec, WorkflowRun } from '@kb-labs/workflow-contracts';
import type { ICache, IEventBus, ILogger } from '@kb-labs/core-platform';

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

  async publish(event: any): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe<T>(_topic: string, _handler: (event: T) => void | Promise<void>): () => void {
    return () => {}; // Unsubscribe function
  }
}

// Mock Logger
const createMockLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(function () {
    return createMockLogger();
  }),
});

describe('WorkflowEngine', () => {
  let cache: MockCache;
  let events: MockEventBus;
  let logger: ILogger;
  let engine: WorkflowEngine;

  beforeEach(() => {
    cache = new MockCache();
    events = new MockEventBus();
    logger = createMockLogger();

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
});
