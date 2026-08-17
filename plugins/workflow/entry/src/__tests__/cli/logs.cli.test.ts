import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import logsCommand from '../../commands/logs.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleLogs = [
  { level: 'info' as const, message: 'Step started', timestamp: new Date().toISOString() },
  { level: 'warn' as const, message: 'Retrying step', timestamp: new Date().toISOString() },
  { level: 'info' as const, message: 'Step finished', timestamp: new Date().toISOString(), stepId: 'step-1' },
];

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:logs', () => {
  it('CLG-01: --run-id outputs log lines via ctx.ui.log', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-123' } }));

    expect(result.ok).toBe(true);
    expect(captured.logs.length).toBe(3);
    expect(captured.logs[0]?.message).toContain('Step started');
  });

  it('CLG-02: --job-id outputs log lines via job endpoint', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'j-abc' } }));

    expect(result.ok).toBe(true);
    expect(captured.logs.length).toBe(3);
  });

  it('CLG-03: --json returns { ok: true, data: { logs } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-123', json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: { logs: typeof sampleLogs } };
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.data.logs)).toBe(true);
    expect(payload.data.logs.length).toBe(3);
  });

  it('CLG-04: neither --run-id nor --job-id returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CLG-05: empty logs renders empty state without throwing', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => [],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-empty' } }));

    expect(result.ok).toBe(true);
    expect(captured.errors.length).toBe(0);
    expect(captured.warnings.length).toBeGreaterThan(0);
  });

  it('CLG-06: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await logsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-123' } }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CLG-07: emits deprecation warning on every invocation', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRunLogs: async () => sampleLogs,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await logsCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-123' } }));

    expect(captured.warnings.some((w: { message: string }) => w.message.includes('deprecated'))).toBe(true);
  });
});
