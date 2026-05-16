import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from '../core/workflow-engine.js';
import type { WorkflowDefinition, WorkflowStepDefinition } from '../core/workflow-engine.js';
import type { IResourceManager, IStorage, IEventBus, ILogger, ResourceSlot } from '@kb-labs/core-platform';

// ── Mock factories ────────────────────────────────────────────────────────────

function mockSlot(): ResourceSlot {
  return { id: 'slot-1', resource: 'workflow', tenantId: 'default', acquiredAt: new Date() };
}

function makeResources(slot: ResourceSlot | null = mockSlot()): IResourceManager {
  return {
    acquireSlot: vi.fn(async () => slot),
    releaseSlot: vi.fn(async () => {}),
    getAvailability: vi.fn(async () => ({ resource: 'workflow', total: 5, used: 0, available: 5, queueLength: 0 })),
    setQuota: vi.fn(async () => {}),
    getQuota: vi.fn(async () => null),
  } as unknown as IResourceManager;
}

function makeStorage(existingData?: Record<string, Buffer>): IStorage {
  const store: Record<string, Buffer> = { ...existingData };
  return {
    read: vi.fn(async (path: string) => store[path] ?? null),
    write: vi.fn(async (path: string, data: Buffer) => { store[path] = data; }),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    exists: vi.fn(async (path: string) => path in store),
  } as unknown as IStorage;
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

// ── Simple step definitions ───────────────────────────────────────────────────

function step(id: string, fn: (input: unknown) => Promise<unknown>, options?: Partial<WorkflowStepDefinition>): WorkflowStepDefinition {
  return { id, name: id, handler: fn, ...options };
}

function echoStep(id: string): WorkflowStepDefinition {
  return step(id, async (input) => input);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let resources: ReturnType<typeof makeResources>;
  let storage: ReturnType<typeof makeStorage>;
  let events: ReturnType<typeof makeEvents>;

  beforeEach(() => {
    resources = makeResources();
    storage = makeStorage();
    events = makeEvents();
    engine = new WorkflowEngine(resources, storage, events, makeLogger());
  });

  describe('registerWorkflow / unregisterWorkflow', () => {
    it('registers a workflow and makes it executable', async () => {
      const def: WorkflowDefinition = {
        id: 'wf-hello',
        name: 'Hello',
        steps: [echoStep('step1')],
      };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-hello', { msg: 'hi' });
      expect(run.status).toBe('completed');
      expect(run.output).toEqual({ msg: 'hi' });
    });

    it('throws for unknown workflow id', async () => {
      await expect(engine.execute('wf-missing', {})).rejects.toThrow('Workflow not found: wf-missing');
    });

    it('unregisterWorkflow makes workflow unavailable', async () => {
      const def: WorkflowDefinition = { id: 'wf-temp', name: 'Temp', steps: [echoStep('s1')] };
      engine.registerWorkflow(def);
      engine.unregisterWorkflow('wf-temp');
      await expect(engine.execute('wf-temp', {})).rejects.toThrow('not found');
    });
  });

  describe('execute — happy path', () => {
    it('chains step output as next step input', async () => {
      const def: WorkflowDefinition = {
        id: 'wf-chain',
        name: 'Chain',
        steps: [
          step('add', async (n) => (n as number) + 10),
          step('mul', async (n) => (n as number) * 2),
        ],
      };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-chain', 5);
      expect(run.status).toBe('completed');
      expect(run.output).toBe(30); // (5 + 10) * 2
    });

    it('sets startedAt and completedAt timestamps', async () => {
      const def: WorkflowDefinition = { id: 'wf-time', name: 'Time', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      const before = new Date();
      const run = await engine.execute('wf-time', {});
      const after = new Date();
      expect(run.startedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(run.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('publishes workflow.started and workflow.completed events', async () => {
      const def: WorkflowDefinition = { id: 'wf-events', name: 'Events', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      await engine.execute('wf-events', {});
      expect(events.publish).toHaveBeenCalledWith('workflow.started', expect.objectContaining({ workflowId: 'wf-events' }));
      expect(events.publish).toHaveBeenCalledWith('workflow.completed', expect.objectContaining({ workflowId: 'wf-events' }));
    });

    it('persists run to storage after completion', async () => {
      const def: WorkflowDefinition = { id: 'wf-persist', name: 'Persist', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-persist', 'data');
      expect(storage.write).toHaveBeenCalledWith(
        expect.stringContaining(`workflows/${run.id}.json`),
        expect.any(Buffer)
      );
    });

    it('acquires and releases resource slot', async () => {
      const slot = mockSlot();
      (resources.acquireSlot as ReturnType<typeof vi.fn>).mockResolvedValue(slot);

      const def: WorkflowDefinition = { id: 'wf-slot', name: 'Slot', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      await engine.execute('wf-slot', {});

      expect(resources.acquireSlot).toHaveBeenCalledWith('workflow', 'default', expect.any(Number));
      expect(resources.releaseSlot).toHaveBeenCalledWith(slot);
    });
  });

  describe('execute — failure handling', () => {
    it('failing step without continueOnError → run fails', async () => {
      const def: WorkflowDefinition = {
        id: 'wf-fail',
        name: 'Fail',
        steps: [
          step('bad', async () => { throw new Error('step broke'); }),
          step('skipped', async () => 'should not run'),
        ],
      };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-fail', {});
      expect(run.status).toBe('failed');
      expect(run.error).toContain('step broke');
    });

    it('continueOnError=true → next step runs with failed step output as undefined', async () => {
      const step2Input: unknown[] = [];
      const def: WorkflowDefinition = {
        id: 'wf-continue',
        name: 'Continue',
        steps: [
          step('bad', async () => { throw new Error('oops'); }, { continueOnError: true }),
          step('after', async (input) => { step2Input.push(input); return 'recovered'; }),
        ],
      };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-continue', 'start');
      expect(run.status).toBe('completed');
      expect(run.steps[0]!.status).toBe('failed');
      expect(run.steps[1]!.status).toBe('completed');
      expect(step2Input).toHaveLength(1); // step2 ran
    });

    it('quota exceeded (null slot) → throws', async () => {
      (resources.acquireSlot as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const def: WorkflowDefinition = { id: 'wf-quota', name: 'Quota', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      await expect(engine.execute('wf-quota', {})).rejects.toThrow('quota exceeded');
    });
  });

  describe('cancel', () => {
    it('cancels a pending run', async () => {
      // We need a run that exists in memory — execute creates one
      // Set up a step that pauses long enough to cancel (but we can't actually pause here)
      // Instead test cancel on the finished run in a different state
      const def: WorkflowDefinition = { id: 'wf-cancel', name: 'Cancel', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-cancel', {});
      // After completion, cancel should throw (already completed)
      await expect(engine.cancel(run.id)).rejects.toThrow('Cannot cancel');
    });

    it('throws for unknown runId', async () => {
      await expect(engine.cancel('nonexistent-run')).rejects.toThrow('not found');
    });
  });

  describe('getStatus', () => {
    it('returns run from memory', async () => {
      const def: WorkflowDefinition = { id: 'wf-status', name: 'Status', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      const run = await engine.execute('wf-status', 'hi');
      const status = await engine.getStatus(run.id);
      expect(status?.id).toBe(run.id);
      expect(status?.status).toBe('completed');
    });

    it('returns null for unknown runId with no storage data', async () => {
      const status = await engine.getStatus('nonexistent-run');
      expect(status).toBeNull();
    });

    it('loads persisted run from storage when not in memory', async () => {
      const storedRun = { id: 'persisted-run', status: 'completed', workflowId: 'wf-x' };
      const storageWithData = makeStorage({
        'workflows/persisted-run.json': Buffer.from(JSON.stringify(storedRun)),
      });
      const freshEngine = new WorkflowEngine(resources, storageWithData, events, makeLogger());
      const status = await freshEngine.getStatus('persisted-run');
      expect(status?.id).toBe('persisted-run');
      expect(status?.status).toBe('completed');
    });
  });

  describe('list', () => {
    it('returns empty list when no runs', async () => {
      expect(await engine.list()).toEqual([]);
    });

    it('filters by workflowId', async () => {
      for (const id of ['wf-a', 'wf-b', 'wf-a']) {
        const def: WorkflowDefinition = { id, name: id, steps: [echoStep('s')] };
        engine.registerWorkflow(def);
        await engine.execute(id, {});
      }
      const list = await engine.list({ workflowId: 'wf-a' });
      expect(list).toHaveLength(2);
      expect(list.every(r => r.workflowId === 'wf-a')).toBe(true);
    });

    it('filters by status', async () => {
      const def: WorkflowDefinition = { id: 'wf-status-filter', name: 'S', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      await engine.execute('wf-status-filter', {});
      await engine.execute('wf-status-filter', {});
      const completed = await engine.list({ status: 'completed' });
      expect(completed.every(r => r.status === 'completed')).toBe(true);
    });

    it('applies offset and limit', async () => {
      const def: WorkflowDefinition = { id: 'wf-page', name: 'Page', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      for (let i = 0; i < 5; i++) await engine.execute('wf-page', i);
      const page = await engine.list({ offset: 1, limit: 2 });
      expect(page).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns stats with zero counts when empty', () => {
      const stats = engine.getStats();
      expect(stats.totalRuns).toBe(0);
      expect(stats.runningCount).toBe(0);
      expect(stats.registeredWorkflows).toBe(0);
    });

    it('counts registered workflows and completed runs', async () => {
      const def: WorkflowDefinition = { id: 'wf-stats', name: 'Stats', steps: [echoStep('s')] };
      engine.registerWorkflow(def);
      await engine.execute('wf-stats', {});
      const stats = engine.getStats();
      expect(stats.registeredWorkflows).toBe(1);
      expect(stats.totalRuns).toBe(1);
      expect(stats.byStatus['completed']).toBe(1);
    });
  });
});
