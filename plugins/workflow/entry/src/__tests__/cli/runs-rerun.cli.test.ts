import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsRerunCommand from '../../commands/runs-rerun.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs rerun', () => {
  it('RRR-01: reruns a workflow and prints new run ID', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => ({
        id: 'run-abc',
        name: 'build',
        status: 'success' as const,
        createdAt: new Date().toISOString(),
        metadata: { workflowId: 'build' },
        inputs: { branch: 'main' },
      }),
      runWorkflow: async () => ({ runId: 'run-new-001', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Rerun');
  });

  it('RRR-02: --json outputs { ok, data }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => ({
        id: 'run-abc',
        name: 'build',
        status: 'success' as const,
        createdAt: new Date().toISOString(),
        metadata: { workflowId: 'build' },
      }),
      runWorkflow: async () => ({ runId: 'run-new-002', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RRR-03: missing run ID returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RRR-04: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => { throw new Error('daemon unavailable'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RRR-05: --dry-run shows intent, daemon is NOT called', async () => {
    const getRun = vi.fn();
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, getRun }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'dry-run': true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(getRun).not.toHaveBeenCalled();
    expect(captured.infos.length).toBeGreaterThan(0);
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('run-abc');
  });

  it('RRR-06: --dry-run with --failed-only mentions it in summary', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'dry-run': true, 'failed-only': true } }),
    );

    expect(captured.infos[0]?.message).toContain('failed');
  });
});
