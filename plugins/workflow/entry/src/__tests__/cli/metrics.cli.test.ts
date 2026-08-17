import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import type { WorkflowMetricsData } from '../../http-client.js';
import metricsCommand from '../../commands/metrics.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleMetrics: WorkflowMetricsData = {
  runs: { total: 42, queued: 2, running: 3, completed: 35, failed: 2, cancelled: 0 },
  jobs: { total: 120, queued: 5, running: 8, completed: 100, failed: 7 },
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:metrics', () => {
  it('CM-01: renders table with run and job counts', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getMetrics: async () => sampleMetrics,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await metricsCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Metrics');
  });

  it('CM-02: --json returns { ok: true, data: WorkflowMetricsData }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getMetrics: async () => sampleMetrics,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await metricsCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: WorkflowMetricsData };
    expect(payload.ok).toBe(true);
    expect(payload.data.runs.total).toBe(42);
    expect(payload.data.jobs.total).toBe(120);
  });

  it('CM-03: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getMetrics: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await metricsCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
