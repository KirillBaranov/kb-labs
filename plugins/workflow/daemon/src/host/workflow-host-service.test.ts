import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRun } from '@kb-labs/workflow-contracts';
import { WorkflowHostService } from './workflow-host-service.js';

function createService(overrides: Partial<Record<string, any>> = {}) {
  const engine = {
    getMetrics: vi.fn(async () => ({ runs: { total: 1 } })),
    getRun: vi.fn(async () => null),
    getAllRuns: vi.fn(async () => []),
    getActiveExecutions: vi.fn(async () => []),
    cancelRun: vi.fn(async () => undefined),
    runFromSpec: vi.fn(async () => ({ id: 'run-1', status: 'queued' })),
    ...overrides.engine,
  };

  const jobBroker = {
    submit: vi.fn(async () => ({ id: 'job-1' })),
    getJobLogs: vi.fn(async () => []),
    ...overrides.jobBroker,
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => logger),
    ...overrides.logger,
  };

  const workflowService = overrides.workflowService;
  const cronScheduler = overrides.cronScheduler;

  return new WorkflowHostService({
    engine: engine as any,
    jobBroker: jobBroker as any,
    logger: logger as any,
    workflowService: workflowService as any,
    cronScheduler: cronScheduler as any,
  });
}

describe('WorkflowHostService', () => {
  it('submits job and returns jobId', async () => {
    const submit = vi.fn(async () => ({ id: 'run-42' }));
    const service = createService({ jobBroker: { submit } });

    const result = await service.submitJob('tenant_1', {
      type: 'mind:rag-query',
      payload: { text: 'hello' },
      priority: 9,
    });

    expect(result).toEqual({ jobId: 'run-42' });
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith({
      handler: 'mind:rag-query',
      input: { text: 'hello' },
      priority: 'high',
    });
  });

  it('rejects invalid tenant id', async () => {
    const service = createService();

    await expect(
      service.submitJob('tenant with spaces', { type: 'mind:rag-query' }),
    ).rejects.toThrow('Invalid tenant ID format');
  });

  it('maps run to job status response', async () => {
    const run: WorkflowRun = {
      id: 'run-1',
      name: 'job-mind:rag-query',
      version: '1.0.0',
      status: 'success',
      createdAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      jobs: [],
      trigger: { type: 'manual' },
      env: {},
    } as WorkflowRun;

    const service = createService({
      engine: { getRun: vi.fn(async () => run) },
    });

    const result = await service.getJob('tenant_1', 'run-1');
    expect(result.id).toBe('run-1');
    expect(result.status).toBe('completed');
    expect(result.type).toBe('job-mind:rag-query');
  });

  it('passes run target/isolation overrides to engine', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        jobs: {
          build: {
            runsOn: 'sandbox',
            steps: [{ name: 'step', uses: 'builtin:shell', with: { command: 'echo ok' } }],
          },
        },
      },
    }));
    const service = createService({
      engine: { runFromSpec },
      workflowService: { get },
    });

    await service.runWorkflow('wf-1', {
      isolation: 'strict',
      target: {
        namespace: 'team-a/prod',
        environmentId: 'env-1',
      },
      trigger: { type: 'manual' },
    });

    expect(runFromSpec).toHaveBeenCalledOnce();
    const calls = (runFromSpec as any).mock.calls as Array<[Record<string, unknown>, unknown]>;
    const [specArg] = calls[0] ?? [];
    expect(specArg?.isolation).toBe('strict');
    expect(specArg?.target).toEqual({
      namespace: 'team-a/prod',
      environmentId: 'env-1',
    });
  });
});
