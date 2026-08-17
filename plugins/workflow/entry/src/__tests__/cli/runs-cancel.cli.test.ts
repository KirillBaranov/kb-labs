import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsCancelCommand from '../../commands/runs-cancel.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs cancel', () => {
  it('RCX-01: cancels a run and prints confirmation', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined);
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, cancelRun }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(cancelRun).toHaveBeenCalledWith('run-abc');
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Cancellation Requested');
  });

  it('RCX-02: --json outputs { ok: true, data: { runId, cancelled: true } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      cancelRun: vi.fn().mockResolvedValue(undefined),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { runId: 'run-abc', cancelled: true } });
  });

  it('RCX-03: --run-id flag works as alias for positional argument', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined);
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, cancelRun }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-flag-001' } }),
    );

    expect(result.ok).toBe(true);
    expect(cancelRun).toHaveBeenCalledWith('run-flag-001');
  });

  it('RCX-04: missing runId returns exitCode 1 and validation error', async () => {
    MockedClient.mockImplementation(() => makeClient(defaultWorkflowClient));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length + captured.warnings.length).toBeGreaterThan(0);
  });

  it('RCX-05: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      cancelRun: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(false);
  });

  it('RCX-06: daemon returns error (run not found / already finished) returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      cancelRun: vi.fn().mockRejectedValue(new Error('Failed to cancel run: Not Found')),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsCancelCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-finished'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
