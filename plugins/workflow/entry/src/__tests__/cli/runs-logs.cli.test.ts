import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsLogsCommand from '../../commands/runs-logs.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleLogs = [
  { level: 'info' as const, message: 'Step started', timestamp: new Date().toISOString() },
  { level: 'warn' as const, message: 'Retrying step', timestamp: new Date().toISOString(), stepName: 'build' },
  { level: 'error' as const, message: 'Step failed', timestamp: new Date().toISOString(), stepId: 'step-3' },
];

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs-logs', () => {
  it('RLG-01: positional runId renders log lines', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsLogsCommand.execute(ctx, mockCLIInput({ flags: {}, argv: ['r-123'] }));

    expect(result.ok).toBe(true);
    expect(captured.logs.length).toBe(3);
    expect(captured.logs[0]?.message).toContain('Step started');
  });

  it('RLG-02: --run-id flag form renders log lines', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsLogsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-456' } }));

    expect(result.ok).toBe(true);
    expect(captured.logs.length).toBe(3);
  });

  it('RLG-03: --json returns { ok: true, data: { logs } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsLogsCommand.execute(ctx, mockCLIInput({ flags: { json: true }, argv: ['r-123'] }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: { logs: typeof sampleLogs } };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.logs)).toBe(true);
    expect(payload.data.logs.length).toBe(3);
  });

  it('RLG-04: missing runId returns exitCode 1 with validation error message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsLogsCommand.execute(ctx, mockCLIInput({ flags: {}, argv: [] }));

    expect(result.ok).toBe(false);
    expect(captured.errors.some(e => e.includes('Missing run ID'))).toBe(true);
  });

  it('RLG-07: --step passes stepId to getRunLogs', async () => {
    let capturedParams: { stepId?: string } = {};
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async (_runId: string, params: { stepId?: string }) => {
        capturedParams = params;
        return [];
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsLogsCommand.execute(ctx, mockCLIInput({ flags: { step: 'build' }, argv: ['r-123'] }));

    expect(capturedParams.stepId).toBe('build');
  });

  it('RLG-05: --log-failed passes failedOnly to getRunLogs', async () => {
    let capturedParams: { failedOnly?: boolean } = {};
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async (_runId: string, params: { failedOnly?: boolean }) => {
        capturedParams = params;
        return [];
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsLogsCommand.execute(ctx, mockCLIInput({ flags: { 'log-failed': true }, argv: ['r-123'] }));

    expect(capturedParams.failedOnly).toBe(true);
  });

  it('RLG-06: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsLogsCommand.execute(ctx, mockCLIInput({ flags: {}, argv: ['r-123'] }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
