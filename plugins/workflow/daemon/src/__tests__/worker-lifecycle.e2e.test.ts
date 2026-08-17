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

  it('BUG-001: with.env object input coerced to JSON string, not [object Object]', async () => {
    // Regression: when a step uses `with: { env: { KEY: '${{ inputs.payload }}' } }`
    // and inputs.payload is an object, worker.ts must apply coerceToString so the
    // env var receives valid JSON — not the string "[object Object]".
    // This is the secondary path distinct from buildShellSafeCommand's _WF_* vars.
    const runId = `run-env-coerce-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const invoicePayload = { vendor: 'Acme Corp', amount: 15000, currency: 'USD' };
    const run: any = {
      id: runId,
      tenantId: 'default',
      env: {},
      inputs: { invoice_payload: invoicePayload },
      metadata: {},
      trigger: { type: 'manual' },
      jobs: [{
        id: jobId,
        jobName: 'env-coerce-job',
        status: 'queued',
        attempt: 0,
        steps: [{
          id: 'step-1',
          status: 'pending',
          spec: {
            uses: 'builtin:shell',
            with: {
              command: 'jq --argjson payload "${KB_INVOICE_PAYLOAD}" .',
              env: { KB_INVOICE_PAYLOAD: '${{ inputs.invoice_payload }}' },
            },
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
    const envVars = call.spec.with.env as Record<string, string>;

    // Must be valid JSON — not "[object Object]"
    expect(envVars['KB_INVOICE_PAYLOAD']).toBe(JSON.stringify(invoicePayload));
    expect(envVars['KB_INVOICE_PAYLOAD']).not.toContain('[object Object]');
    // Must be parseable by jq (i.e., valid JSON string)
    expect(() => JSON.parse(envVars['KB_INVOICE_PAYLOAD']!)).not.toThrow();
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

  it('does not execute steps after approval when run is cancelled — regression for merge-without-approval bug', async () => {
    // Original regression: when a run was cancelled while a builtin:approval step
    // was waiting, the in-process polling loop (`waitForApproval`) returned 'done'
    // instead of 'interrupted' because it only checked step status (which the
    // engine set to 'success' on cancel), not run status — the pipeline continued
    // past the approval gate and executed Merge PR without human approval.
    //
    // `waitForApproval` no longer exists: the worker now parks the step and
    // returns immediately (releasing the worker slot) instead of polling — see
    // worker.ts's builtin:approval branch. This test now verifies a stronger
    // guarantee than before: the worker doesn't just check the right field, it
    // never looks at run/step state again at all once parked, so nothing the
    // mocked `getRun()` returns afterward (however it's shaped) can cause the
    // action step to run. Re-queuing a parked-but-cancelled job is guarded
    // separately, at `engine.resolveApproval`.
    const runId = `run-cancel-approval-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;

    const approvalStep: any = {
      id: 'step-approval',
      status: 'pending',
      spec: { id: 'approval', uses: 'builtin:approval', with: { message: 'Approve?' } },
    };
    const actionStep: any = {
      id: 'step-action',
      status: 'pending',
      spec: { uses: 'plugin:test/handler', with: {} },
    };

    const run: any = {
      id: runId,
      tenantId: 'default',
      status: 'running',
      env: {},
      metadata: {},
      trigger: { type: 'manual' },
      inputs: {},
      jobs: [{
        id: jobId,
        jobName: 'job',
        status: 'queued',
        attempt: 0,
        steps: [approvalStep, actionStep],
      }],
    };

    let markStepWaitingApprovalCalled = false;
    const completion = createDeferred<void>();

    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) { return null; }
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) {
        if (id !== runId) { return null; }
        if (markStepWaitingApprovalCalled) {
          // Simulate what the engine does on cancel: run.status='cancelled' AND
          // the waiting approval step gets marked 'success' to finalize state.
          // This is the exact condition that caused waitForApproval to return 'done'
          // as if a human had approved — the bug we are fixing.
          return {
            ...run,
            status: 'cancelled',
            jobs: [{ ...run.jobs[0], steps: [{ ...approvalStep, status: 'success' }, actionStep] }],
          };
        }
        return run;
      },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() {
        run.jobs[0].status = 'success';
        completion.resolve();
      },
      async markJobFailed(_r: string, _j: string, err: Error) {
        completion.reject(err);
      },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {},
      async markStepWaitingApproval() {
        markStepWaitingApprovalCalled = true;
        approvalStep.status = 'waiting_approval';
      },
      getStateStore: vi.fn(() => ({
        updateStep: vi.fn(async () => {}),
      })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-approval-cancel',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();

    // No polling to wait out anymore — the worker parks and returns almost
    // immediately. A short tick is enough for the job promise to settle.
    await new Promise(resolve => setTimeout(resolve, 200));

    await worker.stop();
    await startPromise;

    // CRITICAL: the action step after a cancelled approval must NEVER execute.
    // Before the fix this assertion failed — the worker continued as if approved.
    expect(mockRunnerExecute).not.toHaveBeenCalled();

    // Job must not have completed successfully (was interrupted, not approved)
    expect(run.jobs[0].status).not.toBe('success');
  });

  it('regression: aborts in-process execution when the job is marked terminal by ' +
    'something else between steps, instead of continuing and re-finalizing it. ' +
    'Before the fix, the step loop only re-checked run.status === "cancelled" on ' +
    'each iteration — never job.status. A job marked \'failed\' by a concurrent ' +
    'writer (another daemon instance\'s cleanupStaleRuns, a racing markJobFailed) ' +
    'would still have its remaining steps executed by this in-process loop, and ' +
    'the loop would then call markJobCompleted/markJobFailed on an already-' +
    'terminal job — this is the "job failed but still executing" bug.', async () => {
    const runId = `run-terminal-mid-loop-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;
    const run: any = {
      id: runId,
      tenantId: 'default',
      status: 'running',
      env: {},
      metadata: {},
      jobs: [{
        id: jobId,
        jobName: 'test-job',
        status: 'queued',
        attempt: 0,
        steps: [
          { id: 'step-1', status: 'pending', spec: { uses: 'plugin:test/handler', with: {} } },
          { id: 'step-2', status: 'pending', spec: { uses: 'plugin:test/handler', with: {} } },
        ],
      }],
    };

    let step1Executed = false;
    mockRunnerExecute.mockImplementation(async () => {
      if (!step1Executed) {
        step1Executed = true;
        // Simulate a concurrent writer marking this job failed while step-1
        // is executing — e.g. another daemon instance's cleanupStaleRuns, or
        // a racing markJobFailed call for an unrelated reason.
        run.jobs[0].status = 'failed';
      }
      return { status: 'success', outputs: {} };
    });

    let queueDrained = false;
    let markJobCompletedCalled = false;
    let markJobFailedCalled = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) { return null; }
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) {
        return id === runId ? run : null;
      },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markStepStarted(_r: string, _j: string, stepId: string) {
        const s = run.jobs[0].steps.find((x: any) => x.id === stepId);
        if (s) { s.status = 'running'; }
      },
      async markStepCompleted(_r: string, _j: string, stepId: string) {
        const s = run.jobs[0].steps.find((x: any) => x.id === stepId);
        if (s) { s.status = 'success'; }
      },
      async markStepFailed() {},
      async markJobInterrupted() {},
      async markJobCompleted() { markJobCompletedCalled = true; },
      async markJobFailed() { markJobFailedCalled = true; },
      getStateStore: vi.fn(() => ({
        updateStep: vi.fn(async () => {}),
      })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-terminal-mid-loop',
      platform: {
        executionBackend: { execute: vi.fn() } as any,
        hasExecutionBackend: true,
        getAdapter: vi.fn().mockReturnValue(undefined),
      },
      concurrency: 1,
    });

    const startPromise = worker.start();
    await new Promise(resolve => setTimeout(resolve, 300));
    await worker.stop();
    await startPromise;

    // step-2 must never have run.
    expect(mockRunnerExecute).toHaveBeenCalledTimes(1);
    // Neither terminal-marking method fires again on a job already terminal.
    expect(markJobCompletedCalled).toBe(false);
    expect(markJobFailedCalled).toBe(false);
    expect(run.jobs[0].status).toBe('failed');
  });

  it('WF-003: cancel during step execution calls markJobInterrupted, not markJobCompleted', async () => {
    // Regression: when a run is cancelled while steps are executing, the worker
    // detected the cancellation and broke out of the loop — but then called
    // markJobCompleted unconditionally. This caused the run to finish as SUCCESS
    // instead of staying CANCELLED.
    //
    // Fix: track wasCancelled flag in the step loop; call markJobInterrupted on
    // cancel path, markJobCompleted only when the loop finished without cancellation.
    const runId = `run-cancel-wf003-${Date.now().toString(36)}`;
    const jobId = `${runId}:job`;

    const run: any = {
      id: runId,
      tenantId: 'default',
      status: 'running',
      env: {},
      metadata: {},
      trigger: { type: 'manual' },
      inputs: {},
      jobs: [{
        id: jobId,
        jobName: 'job',
        status: 'queued',
        attempt: 0,
        steps: [
          {
            id: 'step-1',
            status: 'pending',
            spec: { uses: 'plugin:test/handler', with: {} },
          },
          {
            id: 'step-2',
            status: 'pending',
            spec: { uses: 'plugin:test/handler', with: {} },
          },
        ],
      }],
    };

    // After step-1 runs, the run becomes cancelled (simulates user calling cancelRun)
    let step1Executed = false;
    mockRunnerExecute.mockImplementation(async () => {
      step1Executed = true;
      // Simulate cancellation happening while step-1 was executing
      run.status = 'cancelled';
      return { status: 'success', outputs: {} };
    });

    const markJobCompletedSpy = vi.fn();
    const markJobInterruptedSpy = vi.fn();
    const completion = createDeferred<void>();

    let queueDrained = false;
    const engine: any = {
      async nextJob() {
        if (queueDrained) { return null; }
        queueDrained = true;
        return { runId, jobId };
      },
      async getRun(id: string) {
        return id === runId ? run : null;
      },
      async markJobStarted() { run.jobs[0].status = 'running'; },
      async markJobCompleted() {
        markJobCompletedSpy();
        run.jobs[0].status = 'success';
        completion.resolve();
      },
      async markJobFailed(_r: string, _j: string, err: Error) {
        completion.reject(err);
      },
      async markStepStarted() {},
      async markStepCompleted() {},
      async markStepFailed() {},
      async markJobInterrupted() {
        markJobInterruptedSpy();
        completion.resolve();
      },
      getStateStore: vi.fn(() => ({
        updateStep: vi.fn(async () => {}),
      })),
    };

    const logger = mockLogger();

    const worker = await createWorkflowWorker({
      engine,
      cliApi: {} as any,
      logger,
      workspaceRoot: '/tmp/test-wf003',
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('WF-003 completion timeout')), 10_000)),
    ]);
    await worker.stop();
    await startPromise;

    // Step-1 executed, then cancellation was detected before step-2
    expect(step1Executed).toBe(true);
    // Step-2 must NOT execute — cancelled before reaching it
    expect(mockRunnerExecute).toHaveBeenCalledTimes(1);
    // Job must be interrupted (cancelled path), NOT completed (success path)
    expect(markJobInterruptedSpy).toHaveBeenCalledOnce();
    expect(markJobCompletedSpy).not.toHaveBeenCalled();
  });
});
