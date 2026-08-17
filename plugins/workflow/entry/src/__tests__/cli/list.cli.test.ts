import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';
import type { JobStatusInfo } from '@kb-labs/workflow-contracts';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import listCommand from '../../commands/list.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleExecutions: JobStatusInfo[] = [
  { id: 'j-001', type: 'workflow', status: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString() },
  { id: 'j-002', type: 'workflow', status: 'pending', createdAt: new Date().toISOString() },
];

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:list', () => {
  it('CLI-01: renders table of active executions', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => sampleExecutions,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.table.length).toBeGreaterThan(0);
    expect(captured.table[0]!.rows.length).toBe(2);
  });

  it('CLI-02: --json returns { ok: true, data: { executions } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => sampleExecutions,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: { executions: JobStatusInfo[] } };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.executions)).toBe(true);
  });

  it('CLI-03: --status running filters executions client-side', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => sampleExecutions,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: { status: 'running' } }));

    expect(result.ok).toBe(true);
    expect(captured.table[0]!.rows.length).toBe(1);
    expect((captured.table[0]!.rows[0] as { status: string }).status).toBe('running');
  });

  it('CLI-04: --type cron renders cron jobs table', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getCronJobs: async () => ({
        crons: [
          { id: 'cron-1', schedule: '*/5 * * * *', enabled: true, jobType: 'workflow', timezone: 'UTC' },
        ],
      }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: { type: 'cron' } }));

    expect(result.ok).toBe(true);
    expect(captured.table[0]!.rows.length).toBe(1);
    expect((captured.table[0]!.rows[0] as { id: string }).id).toBe('cron-1');
  });

  it('CLI-05: empty execution list renders empty state without throwing', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => [],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.errors.length).toBe(0);
    expect(captured.warnings.length).toBeGreaterThan(0);
  });

  it('CLI-06: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CLI-07: emits deprecation warning when listing runs (not cron)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getExecutions: async () => sampleExecutions,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await listCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(captured.warnings.some((w: { message: string }) => w.message.includes('deprecated'))).toBe(true);
  });

  it('CLI-08: does NOT emit deprecation warning when --type=cron', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getCronJobs: async () => ({ crons: [] }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await listCommand.execute(ctx, mockCLIInput({ flags: { type: 'cron' } }));

    expect(captured.warnings.some((w: { message: string }) => w.message.includes('deprecated'))).toBe(false);
  });
});
