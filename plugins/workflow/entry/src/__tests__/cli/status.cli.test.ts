import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import type { JobStatusDetail } from '../../http-client.js';
import statusCommand from '../../commands/status.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const runningJob: JobStatusDetail = {
  id: 'job-abc',
  type: 'workflow',
  status: 'running',
  createdAt: new Date().toISOString(),
  jobs: [
    {
      id: 'j-1',
      name: 'build',
      status: 'running',
      durationMs: 500,
      steps: [
        { id: 's-1', name: 'install', status: 'success', durationMs: 200 },
        { id: 's-2', name: 'compile', status: 'running' },
      ],
    },
  ],
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:status', () => {
  it('CS-01: --job-id renders status with jobs and steps', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobStatus: async () => runningJob,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'job-abc' } }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CS-02: --json returns { ok: true, data: JobStatusDetail }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobStatus: async () => runningJob,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'job-abc', json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: JobStatusDetail };
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe('job-abc');
    expect(payload.data.status).toBe('running');
  });

  it('CS-03: missing --job-id returns exitCode 1 with error message', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CS-04: daemon unavailable returns exitCode 1 with readable message', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobStatus: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'job-abc' } }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CS-05: job in running state renders status without throwing', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobStatus: async () => ({
        id: 'job-xyz',
        type: 'workflow',
        status: 'running',
        createdAt: new Date().toISOString(),
      }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'job-xyz' } }));

    expect(result.ok).toBe(true);
    expect(captured.errors.length).toBe(0);
  });

  it('CS-06: emits deprecation warning on every invocation', async () => {
    MockedClient.mockImplementation(() => makeClient({
      getJobStatus: async () => runningJob,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await statusCommand.execute(ctx, mockCLIInput({ flags: { 'job-id': 'job-abc' } }));

    expect(captured.warnings.some((w: { message: string }) => w.message.includes('deprecated'))).toBe(true);
  });
});
