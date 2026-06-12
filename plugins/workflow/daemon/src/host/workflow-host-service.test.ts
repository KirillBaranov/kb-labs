import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRun } from '@kb-labs/workflow-contracts';
import { mockLogger } from '@kb-labs/shared-testing';
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
    getRunLogs: vi.fn(async () => []),
    ...overrides.jobBroker,
  };

  const workflowService = overrides.workflowService;
  const cronScheduler = overrides.cronScheduler;

  return new WorkflowHostService({
    engine: engine as any,
    jobBroker: jobBroker as any,
    logger: mockLogger(),
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

  it('getRunLogs delegates to jobBroker.getRunLogs with stepId filter', async () => {
    const mockLog = { timestamp: '2026-01-01T00:00:00.000Z', level: 'info', message: 'Executing step', context: { runId: 'r1', stepId: 's1' } };
    const getRunLogs = vi.fn(async () => [mockLog]);
    const service = createService({ jobBroker: { getRunLogs } });

    const result = await service.getRunLogs('run-1', { stepId: 'step-1', level: 'info', limit: 50 });

    expect(getRunLogs).toHaveBeenCalledWith('run-1', { stepId: 'step-1', level: 'info', limit: 50 });
    expect(result).toEqual([mockLog]);
  });

  it('getRunLogs works without options (returns all logs for run)', async () => {
    const getRunLogs = vi.fn(async () => []);
    const service = createService({ jobBroker: { getRunLogs } });

    await service.getRunLogs('run-42');

    expect(getRunLogs).toHaveBeenCalledWith('run-42', undefined);
  });

  it('runWorkflow resolves inputs from `inputs` field (plural)', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        inputs: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          issueNumber: { type: 'number' },
          baseBranch: { type: 'string', default: 'main' },
        },
        jobs: { main: { runsOn: 'local', steps: [] } },
      },
    }));
    const service = createService({ engine: { runFromSpec }, workflowService: { get } });

    await service.runWorkflow('wf-1', {
      inputs: { owner: 'KirillBaranov', repo: 'kb-labs', issueNumber: 29 },
    });

    expect(runFromSpec).toHaveBeenCalledOnce();
    const callArg = (runFromSpec as any).mock.calls[0]?.[1];
    expect(callArg.inputs).toEqual({
      owner: 'KirillBaranov',
      repo: 'kb-labs',
      issueNumber: 29,
      baseBranch: 'main', // default from spec
    });
  });

  it('runWorkflow falls back to legacy `input` field (singular)', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        inputs: { flag: { type: 'string', default: 'off' } },
        jobs: { main: { runsOn: 'local', steps: [] } },
      },
    }));
    const service = createService({ engine: { runFromSpec }, workflowService: { get } });

    await service.runWorkflow('wf-1', {
      input: { flag: 'on' },
    });

    const callArg = (runFromSpec as any).mock.calls[0]?.[1];
    expect(callArg.inputs).toEqual({ flag: 'on' });
  });

  it('runWorkflow uses spec defaults when no user inputs supplied', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        inputs: { baseBranch: { type: 'string', default: 'main' } },
        jobs: { main: { runsOn: 'local', steps: [] } },
      },
    }));
    const service = createService({ engine: { runFromSpec }, workflowService: { get } });

    await service.runWorkflow('wf-1', {});

    const callArg = (runFromSpec as any).mock.calls[0]?.[1];
    expect(callArg.inputs).toEqual({ baseBranch: 'main' });
  });

  it('B-017: rejects a run missing a required input with no default', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        inputs: {
          owner: { type: 'string', required: true },
          baseBranch: { type: 'string', default: 'main' },
        },
        jobs: { main: { runsOn: 'local', steps: [] } },
      },
    }));
    const service = createService({ engine: { runFromSpec }, workflowService: { get } });

    // Missing required `owner` → must reject before creating the run.
    await expect(
      service.runWorkflow('wf-1', { inputs: { baseBranch: 'dev' } }),
    ).rejects.toThrow(/required input.*owner|owner.*required/i);

    expect(runFromSpec).not.toHaveBeenCalled();
  });

  it('B-017: accepts a required input when provided', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-1', status: 'queued' }));
    const get = vi.fn(async () => ({
      id: 'wf-1',
      input: {
        name: 'Test Workflow',
        version: '1.0.0',
        on: { manual: true },
        inputs: { owner: { type: 'string', required: true } },
        jobs: { main: { runsOn: 'local', steps: [] } },
      },
    }));
    const service = createService({ engine: { runFromSpec }, workflowService: { get } });

    await service.runWorkflow('wf-1', { inputs: { owner: 'kb' } });

    expect(runFromSpec).toHaveBeenCalledOnce();
    const callArg = (runFromSpec as any).mock.calls[0]?.[1];
    expect(callArg.inputs).toEqual({ owner: 'kb' });
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

describe('WorkflowHostService.rerunWorkflow', () => {
  const baseRun = {
    id: 'run-src',
    name: 'my-workflow',
    version: '1.0.0',
    status: 'success',
    createdAt: new Date().toISOString(),
    queuedAt: new Date().toISOString(),
    trigger: { type: 'manual' },
    env: {},
    inputs: { branch: 'main' },
    metadata: { workflowId: 'my-workflow' },
    jobs: [
      { id: 'j1', jobName: 'build', status: 'success', runId: 'run-src', tenantId: 't1', runsOn: 'local', queuedAt: new Date().toISOString(), attempt: 0, artifacts: {}, steps: [] },
      { id: 'j2', jobName: 'test', status: 'failed', runId: 'run-src', tenantId: 't1', runsOn: 'local', queuedAt: new Date().toISOString(), attempt: 0, artifacts: {}, steps: [] },
    ],
  };

  const baseWorkflow = {
    id: 'my-workflow',
    input: {
      name: 'my-workflow',
      version: '1.0.0',
      on: { manual: true },
      jobs: {
        build: { runsOn: 'local', steps: [] },
        test: { runsOn: 'local', needs: ['build'], steps: [] },
      },
    },
  };

  it('RW-A: failedOnly=false reruns all jobs (full spec passed to engine)', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-new', status: 'queued' }));
    const service = createService({
      engine: { getRun: vi.fn(async () => baseRun), runFromSpec },
      workflowService: { get: vi.fn(async () => baseWorkflow) },
    });

    const result = await service.rerunWorkflow('run-src', { failedOnly: false });

    expect(result.runId).toBe('run-new');
    expect(runFromSpec).toHaveBeenCalledOnce();
    const [specArg] = (runFromSpec as any).mock.calls[0] as [Record<string, unknown>];
    const jobs = specArg['jobs'] as Record<string, unknown>;
    expect(Object.keys(jobs)).toEqual(['build', 'test']);
  });

  it('RW-B: failedOnly=true filters to only failed jobs and strips satisfied needs', async () => {
    const runFromSpec = vi.fn(async () => ({ id: 'run-new', status: 'queued' }));
    const service = createService({
      engine: { getRun: vi.fn(async () => baseRun), runFromSpec },
      workflowService: { get: vi.fn(async () => baseWorkflow) },
    });

    await service.rerunWorkflow('run-src', { failedOnly: true });

    const [specArg] = (runFromSpec as any).mock.calls[0] as [Record<string, unknown>];
    const jobs = specArg['jobs'] as Record<string, unknown>;
    // build succeeded — must not be rerun
    expect(Object.keys(jobs)).not.toContain('build');
    // test failed — must be rerun
    expect(Object.keys(jobs)).toContain('test');
    // 'build' stripped from test.needs since it is not in the filtered set
    const testJob = jobs['test'] as Record<string, unknown>;
    expect(testJob['needs']).toEqual([]);
  });

  it('RW-C: failedOnly=true throws when no jobs have failed', async () => {
    const allSuccessRun = {
      ...baseRun,
      jobs: [
        { ...baseRun.jobs[0], status: 'success' },
        { ...baseRun.jobs[1], status: 'success' },
      ],
    };
    const service = createService({
      engine: { getRun: vi.fn(async () => allSuccessRun) },
      workflowService: { get: vi.fn(async () => baseWorkflow) },
    });

    await expect(service.rerunWorkflow('run-src', { failedOnly: true })).rejects.toThrow('No failed jobs to rerun');
  });

  it('RW-D: throws when run is not found', async () => {
    const service = createService({
      engine: { getRun: vi.fn(async () => null) },
    });

    await expect(service.rerunWorkflow('missing-run', { failedOnly: false })).rejects.toThrow('Run not found');
  });
});
