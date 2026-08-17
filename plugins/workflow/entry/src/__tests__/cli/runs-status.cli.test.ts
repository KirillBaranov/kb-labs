import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';
import type { WorkflowRunDetail } from '../../http-client.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsStatusCommand from '../../commands/runs-status.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleRun: WorkflowRunDetail = {
  id: 'r-001',
  name: 'e2e-hello',
  status: 'success',
  createdAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 1500,
  trigger: { type: 'manual', actor: 'kirill' },
  jobs: [
    {
      id: 'j-1',
      jobName: 'build',
      status: 'success',
      durationMs: 800,
      steps: [
        { id: 's-1', name: 'install', status: 'success', durationMs: 300 },
        { id: 's-2', name: 'compile', status: 'success', durationMs: 500 },
      ],
    },
  ],
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs-status', () => {
  it('RST-01: positional runId renders status summary', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRun: async () => sampleRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsStatusCommand.execute(ctx, mockCLIInput({ flags: {}, argv: ['r-001'] }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('RST-02: --run-id flag form renders status summary', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRun: async () => sampleRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsStatusCommand.execute(ctx, mockCLIInput({ flags: { 'run-id': 'r-001' } }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('RST-03: --json returns { ok: true, data: WorkflowRunDetail }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRun: async () => sampleRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsStatusCommand.execute(ctx, mockCLIInput({ flags: { json: true }, argv: ['r-001'] }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: WorkflowRunDetail };
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe('r-001');
    expect(payload.data.status).toBe('success');
  });

  it('RST-04: missing runId returns exitCode 1 with validation error message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsStatusCommand.execute(ctx, mockCLIInput({ flags: {}, argv: [] }));

    expect(result.ok).toBe(false);
    expect(captured.errors.some(e => e.includes('Missing run ID'))).toBe(true);
  });

  it('RST-05: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getRun: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsStatusCommand.execute(ctx, mockCLIInput({ flags: {}, argv: ['r-001'] }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
