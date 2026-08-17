import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsRestartCommand from '../../commands/runs-restart.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs restart', () => {
  it('RST-01: restarts a run and prints new run ID', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      restartRun: async () => ({ runId: 'run-new-001', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Restart');
  });

  it('RST-02: --from-step passes fromStepId to restartRun', async () => {
    const restartRun = vi.fn().mockResolvedValue({ runId: 'run-new-002', status: 'queued', fromStepId: 'checkout' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, restartRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'from-step': 'checkout' } }),
    );

    expect(result.ok).toBe(true);
    expect(restartRun).toHaveBeenCalledWith('run-abc', { fromStepId: 'checkout' });
  });

  it('RST-03: without --from-step, restartRun is called with no fromStepId', async () => {
    const restartRun = vi.fn().mockResolvedValue({ runId: 'run-new-003', status: 'queued' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, restartRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(restartRun).toHaveBeenCalledWith('run-abc', { fromStepId: undefined });
  });

  it('RST-04: --json outputs { ok, data }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      restartRun: async () => ({ runId: 'run-new-004', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RST-05: missing run ID returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RST-06: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      restartRun: async () => { throw new Error('snapshot not available'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RST-07: --run-id flag works as alias for positional arg', async () => {
    const restartRun = vi.fn().mockResolvedValue({ runId: 'run-new-007', status: 'queued' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, restartRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRestartCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc' } }),
    );

    expect(result.ok).toBe(true);
    expect(restartRun).toHaveBeenCalledWith('run-abc', expect.any(Object));
  });
});
