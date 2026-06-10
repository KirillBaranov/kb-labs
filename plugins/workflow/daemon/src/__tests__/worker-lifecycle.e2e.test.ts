import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLogger } from '@kb-labs/shared-testing';

// Mock SandboxRunner — worker tests verify orchestration, not plugin resolution.
// SandboxRunner is tested separately in workflow-runtime.
const mockRunnerExecute = vi.fn();

vi.mock('@kb-labs/workflow-runtime', () => ({
  SandboxRunner: vi.fn().mockImplementation(() => ({
    execute: mockRunnerExecute,
  })),
}));

import { createWorkflowWorker } from '../worker.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('workflow worker lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunnerExecute.mockResolvedValue({ status: 'success', outputs: { ok: true } });
  });

  it('processes a job with steps and delegates execution to runner', async () => {
    const runId = `run-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      tenantId: 'default',
      env: {},
      metadata: {},
      jobs: [{
        id: jobId,
        jobName: 'test-job',
        status: 'queued',
        attempt: 0,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: { uses: 'plugin:test/handler', with: { key: 'value' } },
        }],
      }],
    };

    const completion = createDeferred<void>();

    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) {return null;}
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(requestedRunId: string) {
        return requestedRunId === runId ? run : null;
      },
      async markJobStarted() {
        run.jobs[0].status = 'running';
      },
      async markJobCompleted() {
        run.jobs[0].status = 'success';
        completion.resolve();
      },
      async markJobFailed(_r: string, _j: string, error: Error) {
        completion.reject(error);
      },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
      getStateStore: vi.fn(() => ({
        updateStep: vi.fn(async () => {}),
      })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-workspace',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('worker completion timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    expect(run.jobs[0].status).toBe('success');
    expect(mockRunnerExecute).toHaveBeenCalledOnce();
    // Verify runner received the step spec and context
    const call = mockRunnerExecute.mock.calls[0]?.[0];
    expect(call.spec).toEqual({ uses: 'plugin:test/handler', with: { key: 'value' } });
    expect(call.workspace).toBe('/tmp/test-workspace');
  });

  it('passes target hint from workflow spec to runner', async () => {
    const runId = `run-target-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      tenantId: 'default',
      env: {},
      metadata: {
        target: { namespace: 'custom-ns', environmentId: 'pre-provisioned-env' },
      },
      jobs: [{
        id: jobId,
        jobName: 'test-job',
        status: 'queued',
        attempt: 0,
        target: undefined,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: { uses: 'plugin:test/handler' },
        }],
      }],
    };

    const completion = createDeferred<void>();

    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) {return null;}
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) { return id === runId ? run : null; },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() {
        run.jobs[0].status = 'success';
        completion.resolve();
      },
      async markJobFailed(_r: string, _j: string, error: Error) { completion.reject(error); },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-workspace',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    expect(run.jobs[0].status).toBe('success');
    // Worker should pass target from run.metadata to runner.execute()
    const call = mockRunnerExecute.mock.calls[0]?.[0];
    expect(call.target).toEqual({ namespace: 'custom-ns', environmentId: 'pre-provisioned-env' });
  });

  it('worker does not call any adapters directly', async () => {
    const runId = `run-no-adapters-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      env: {},
      metadata: {},
      jobs: [{
        id: jobId,
        jobName: 'job',
        status: 'queued',
        attempt: 0,
        steps: [],
      }],
    };

    const completion = createDeferred<void>();

    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) {return null;}
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) { return id === runId ? run : null; },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() { run.jobs[0].status = 'success'; completion.resolve(); },
      async markJobFailed(_r: string, _j: string, error: Error) { completion.reject(error); },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
    };

    const logger = mockLogger();

    // Platform has getAdapter returning undefined — worker should handle it gracefully
    const platformObj = {
      executionBackend: { execute: vi.fn() } as any,
      hasExecutionBackend: true,
      getAdapter: vi.fn().mockReturnValue(undefined),
    };

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test',
      platform: platformObj,
      concurrency: 1,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    expect(run.jobs[0].status).toBe('success');
    // getAdapter is called to check for a workspace provider, but since it returns
    // undefined no materialization happens — execution backend is NOT bypassed.
    expect(platformObj.executionBackend.execute).not.toHaveBeenCalled(); // no steps to execute
  });

  it('emits structured diagnostic log when workspace provisioning fails', async () => {
    const runId = `run-ws-fail-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      env: {},
      metadata: {},
      jobs: [{
        id: jobId,
        jobName: 'job',
        status: 'queued',
        attempt: 0,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: { uses: 'plugin:test/handler' },
        }],
      }],
    };

    const completion = createDeferred<void>();
    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) {return null;}
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) { return id === runId ? run : null; },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() { completion.resolve(); },
      async markJobFailed() { run.jobs[0].status = 'failed'; completion.resolve(); },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
    };

    const logger = mockLogger();

    const failingWsProvider = {
      materialize: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: connection timed out')),
      release: vi.fn(),
    };

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-workspace',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(failingWsProvider),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'Workspace provisioning failed',
      expect.any(Error),
      expect.objectContaining({
        diagnosticEvent: 'workflow.workspace.provision',
        reasonCode: 'workspace_provision_timeout',
        serviceId: 'workflow',
      }),
    );
  });

  it('buildShellSafeCommand: builtin:shell step receives env-var references, not raw substituted values', async () => {
    // Regression: issue/PR titles may contain backticks or $() which would be
    // executed if substituted raw into the shell script. buildShellSafeCommand
    // must inject values as _WF_* env vars so shell expansion is safe.
    const runId = `run-shell-safe-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const dangerousTitle = 'Add `kb cancel` command $(whoami)';
    const run: any = {
      id: runId,
      tenantId: 'default',
      env: {},
      inputs: { title: dangerousTitle },
      metadata: {},
      trigger: { type: 'manual' },
      jobs: [{
        id: jobId,
        jobName: 'shell-safe-job',
        status: 'queued',
        attempt: 0,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: {
            uses: 'builtin:shell',
            with: { command: 'echo "${{ inputs.title }}"' },
          },
        }],
      }],
    };

    const completion = createDeferred<void>();
    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) { return null; }
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) { return id === runId ? run : null; },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() { run.jobs[0].status = 'success'; completion.resolve(); },
      async markJobFailed(_r: string, _j: string, error: Error) { completion.reject(error); },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
      getStateStore: vi.fn(() => ({ updateStep: vi.fn(async () => {}) })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-workspace',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    expect(run.jobs[0].status).toBe('success');
    const call = mockRunnerExecute.mock.calls[0]?.[0];

    // Command must use ${_WF_...} reference, NOT the raw dangerous value.
    expect(call.spec.with.command).not.toContain(dangerousTitle);
    expect(call.spec.with.command).not.toContain('${{');
    expect(call.spec.with.command).toContain('${_WF_');

    // Dangerous value injected safely via env var.
    const envVars = call.spec.with.env as Record<string, string>;
    const injectedKey = Object.keys(envVars).find((k) => k.startsWith('_WF_'));
    expect(injectedKey).toBeDefined();
    expect(envVars[injectedKey!]).toBe(dangerousTitle);
  });

  it('debugMode emits verbose [debug] logs for expr context and interpolation', async () => {
    const runId = `run-debug-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      tenantId: 'default',
      env: { MY_VAR: 'hello' },
      inputs: { issueNumber: '42' },
      metadata: {},
      trigger: { type: 'manual' },
      jobs: [{
        id: jobId,
        jobName: 'debug-job',
        status: 'queued',
        attempt: 0,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: { uses: 'plugin:test/handler', with: { number: '${{ inputs.issueNumber }}' } },
        }],
      }],
    };

    const completion = createDeferred<void>();
    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) { return null; }
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) { return id === runId ? run : null; },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() { run.jobs[0].status = 'success'; completion.resolve(); },
      async markJobFailed(_r: string, _j: string, error: Error) { completion.reject(error); },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
      getStateStore: vi.fn(() => ({ updateStep: vi.fn(async () => {}) })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-workspace',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
      debugMode: true,
    });

    const startPromise = worker.start();
    await Promise.race([
      completion.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    // debugMode must emit expression context log
    const infoMessages = logger.messages.filter(e => e.level === 'info').map(e => e.msg);
    expect(infoMessages.some(m => m === '[debug] Expression context for step')).toBe(true);

    // debugMode must emit raw-vs-resolved interpolation log
    expect(infoMessages.some(m => m === '[debug] Step input interpolation')).toBe(true);

    // debugMode must emit outputs log
    expect(infoMessages.some(m => m === '[debug] Step outputs')).toBe(true);
  });
});
