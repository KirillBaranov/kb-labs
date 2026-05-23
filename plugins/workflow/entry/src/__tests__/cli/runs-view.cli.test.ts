import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsViewCommand from '../../commands/runs-view.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const baseRun = {
  id: 'run-abc',
  name: 'deploy',
  status: 'success' as const,
  createdAt: new Date().toISOString(),
  jobs: [
    {
      id: 'job-1',
      jobName: 'build',
      status: 'success' as const,
      steps: [
        { id: 'step-1', name: 'compile', status: 'success' as const },
      ],
    },
  ],
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs view', () => {
  it('RV-01: renders run tree without flags (exitCode 0 on success)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
  });

  it('RV-02: --json=all outputs full run object (BUG-004 path)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: 'all' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { id: 'run-abc' } });
  });

  it('RV-03: --json without value (boolean true) does not crash — treated as --json=all', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    // This was crashing with "jsonFields.split is not a function" before the fix
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true as unknown as string } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { id: 'run-abc' } });
  });

  it('RV-03b: --json before positional arg (--run-id explicit) does not crash', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc', json: true as unknown as string } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RV-04: --json=status,jobs outputs only selected fields', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: 'status,jobs' } }),
    );

    expect(result.exitCode).toBe(0);
    const data = (captured.json[0] as { ok: boolean; data: Record<string, unknown> })?.data;
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('jobs');
    expect(data).not.toHaveProperty('name');
  });

  it('RV-04b: --run-id flag works as alias for positional arg', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json.length).toBe(0); // no --json, so sideBox path
  });

  it('RV-05: no args and no runs → exitCode 0, info message', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      listRuns: async () => [],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.infos.some(i => i.message.includes('No runs found'))).toBe(true);
  });

  it('RV-05b: no args → auto-fetches latest run and shows it', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      listRuns: async () => [{ id: 'run-latest', name: 'deploy', status: 'success' as const, createdAt: new Date().toISOString() }],
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.infos.some(i => i.message.includes('run-latest'))).toBe(true);
  });

  it('RV-06: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => { throw new Error('daemon unreachable'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RV-07: failed run returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => ({ ...baseRun, status: 'failed' as const }),
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
  });
});
