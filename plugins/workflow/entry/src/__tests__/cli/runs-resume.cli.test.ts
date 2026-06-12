import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsResumeCommand from '../../commands/runs-resume.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs resume', () => {
  it('RSM-01: resumes a run and prints confirmation', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      resumeRun: async () => ({ runId: 'run-abc', status: 'running' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'from-step': 'compile' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Resumed');
  });

  it('RSM-02: --json outputs { ok, data }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      resumeRun: async () => ({ runId: 'run-abc', status: 'running' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'from-step': 'compile', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RSM-03: missing run ID returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'from-step': 'compile' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RSM-04: missing --from-step returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RSM-05: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      resumeRun: async () => { throw new Error('Run not found'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: { 'from-step': 'compile' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RSM-06: --run-id flag works as alias for positional arg', async () => {
    const resumeRun = vi.fn().mockResolvedValue({ runId: 'run-alias', status: 'running' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, resumeRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-alias', 'from-step': 'compile' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(resumeRun).toHaveBeenCalledWith('run-alias', { fromStepId: 'compile', jobId: undefined });
  });

  it('RSM-07: --job-id is passed to resumeRun', async () => {
    const resumeRun = vi.fn().mockResolvedValue({ runId: 'run-abc', status: 'running' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, resumeRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsResumeCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'from-step': 'compile', 'job-id': 'build' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(resumeRun).toHaveBeenCalledWith('run-abc', { fromStepId: 'compile', jobId: 'build' });
  });
});
