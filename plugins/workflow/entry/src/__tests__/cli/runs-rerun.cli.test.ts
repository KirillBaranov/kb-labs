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
      rerunWorkflow: async () => ({ runId: 'run-new-001', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Rerun');
  });

  it('RRR-02: --json outputs { ok, data }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      rerunWorkflow: async () => ({ runId: 'run-new-002', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RRR-02b: --run-id flag works as alias for positional arg', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      rerunWorkflow: async () => ({ runId: 'run-new-alias', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('RRR-03: missing run ID returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RRR-04: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      rerunWorkflow: async () => { throw new Error('daemon unavailable'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RRR-05: --dry-run shows intent, daemon is NOT called', async () => {
    const rerunWorkflow = vi.fn();
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, rerunWorkflow }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(rerunWorkflow).not.toHaveBeenCalled();
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

  it('RRR-07: --failed-only passes failedOnly: true to rerunWorkflow', async () => {
    const rerunWorkflow = vi.fn().mockResolvedValue({ runId: 'run-new-007', status: 'queued' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, rerunWorkflow }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { 'failed-only': true } }),
    );

    expect(result.ok).toBe(true);
    expect(rerunWorkflow).toHaveBeenCalledWith('run-abc', { failedOnly: true });
  });

  it('RRR-08: without --failed-only, rerunWorkflow is called with failedOnly: false', async () => {
    const rerunWorkflow = vi.fn().mockResolvedValue({ runId: 'run-new-008', status: 'queued' });
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, rerunWorkflow }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsRerunCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(rerunWorkflow).toHaveBeenCalledWith('run-abc', { failedOnly: false });
  });
});
