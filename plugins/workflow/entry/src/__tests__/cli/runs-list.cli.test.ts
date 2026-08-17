import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import type { WorkflowRunSummary } from '../../http-client.js';
import runsListCommand from '../../commands/runs-list.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleRuns: WorkflowRunSummary[] = [
  { id: 'r-001', name: 'e2e-hello', status: 'success', createdAt: new Date().toISOString(), durationMs: 1200 },
  { id: 'r-002', name: 'e2e-world', status: 'running', createdAt: new Date().toISOString() },
];

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs list', () => {
  it('CL-01: renders table when runs exist', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => sampleRuns,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.table.length).toBeGreaterThan(0);
    expect(captured.table[0]!.rows.length).toBe(2);
  });

  it('CL-02: --json returns array of WorkflowRunSummary', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => sampleRuns,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: typeof sampleRuns };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBe(2);
  });

  it('CL-03: --status running filters by status', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
        expect(params.status).toBe('running');
        return [sampleRuns[1]!];
      },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsListCommand.execute(ctx, mockCLIInput({ flags: { status: 'running' } }));

    expect(captured.table[0]?.rows.length).toBe(1);
  });

  it('CL-04: --limit 5 passes limit to client', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
        expect(params.limit).toBe(5);
        return sampleRuns.slice(0, 1);
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: { limit: 5 } }));

    expect(result.ok).toBe(true);
  });

  it('CL-05: --workflow filters by workflowId', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
        expect(params.workflowId).toBe('e2e-hello');
        return [sampleRuns[0]!];
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsListCommand.execute(ctx, mockCLIInput({ flags: { workflow: 'e2e-hello' } }));
  });

  it('CL-06: empty list renders empty state, does not throw', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.errors.length).toBe(0);
  });

  it('CL-07: daemon unavailable — error message, exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CL-09: future startedAt renders as "just now" (not negative)', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [
        { id: 'r-future', name: 'future-run', status: 'running', createdAt: futureDate, startedAt: futureDate },
      ],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    const row = captured.table[0]!.rows[0]!;
    const whenCell = row['When'] as string;
    expect(whenCell).toBe('just now');
    expect(whenCell).not.toMatch(/-\d/);
  });

  it('CL-08: --limit "3" (string) passes limit=3 to client', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
        expect(params.limit).toBe(3);
        return sampleRuns.slice(0, 1);
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: { limit: '3' as unknown as number } }));

    expect(result.ok).toBe(true);
  });

  it('CL-11: RUNNING run with currentStepName shows step name in Step column', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [
        { id: 'r-run', name: 'ci', status: 'running', createdAt: new Date().toISOString(), currentStepName: 'build-image' },
      ],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    const row = captured.table[0]!.rows[0]!;
    expect(row['Step']).toBe('build-image');
  });

  it('CL-12: non-RUNNING run has empty Step column', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [
        { id: 'r-done', name: 'ci', status: 'success', createdAt: new Date().toISOString(), currentStepName: undefined },
      ],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    const row = captured.table[0]!.rows[0]!;
    expect(row['Step']).toBe('');
  });

  it('CL-13: --workflow filters runs by workflow name', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async (params: { status?: string; limit?: number; workflowId?: string } = {}) => {
        expect(params.workflowId).toBe('deploy-prod');
        return [{ id: 'r-dep', name: 'deploy-prod', status: 'success' as const, createdAt: new Date().toISOString() }];
      },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: { workflow: 'deploy-prod' } }));

    expect(result.ok).toBe(true);
    expect(captured.table[0]!.rows.length).toBe(1);
    expect(captured.table[0]!.rows[0]!['Workflow']).toBe('deploy-prod');
  });

  it('CL-14: RUNNING run with waiting_approval step shows step name in Step column', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [
        {
          id: 'r-approval',
          name: 'deploy',
          status: 'running' as const,
          createdAt: new Date().toISOString(),
          hasPendingApproval: true,
          currentStepName: 'await-gate',
        },
      ],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    const row = captured.table[0]!.rows[0]!;
    expect(row['Step']).toBe('await-gate');
  });

  it('CL-10: formatDuration returns "0ms" for durationMs=0 (BUG-007)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      listRuns: async () => [
        { id: 'r-003', name: 'instant', status: 'success' as const, createdAt: new Date().toISOString(), durationMs: 0 },
      ],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

    const durCell = captured.table[0]?.rows[0]?.['Dur'];
    expect(durCell).toBe('0ms');
  });
});
