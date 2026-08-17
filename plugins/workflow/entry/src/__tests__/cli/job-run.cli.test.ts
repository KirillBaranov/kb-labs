import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useLoader: () => ({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      update: vi.fn(),
    }),
  };
});

import { WorkflowDaemonClient } from '../../http-client.js';
import jobRunCommand from '../../commands/run.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('workflow:job-run', () => {
  it('CJR-01: --handler submits job and prints jobId, exitCode 0', async () => {
    MockedClient.mockImplementation(() => makeClient({
      submitJob: async () => ({ id: 'job-abc', status: 'pending' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({ flags: { handler: 'foo#default' } }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CJR-02: --json returns { ok: true, data: { id, status } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      submitJob: async () => ({ id: 'job-abc', status: 'pending' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({ flags: { handler: 'foo#default', json: true } }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; data: { id: string; status: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe('job-abc');
  });

  it('CJR-03: --input passes parsed JSON to submitJob', async () => {
    let capturedPayload: unknown;
    MockedClient.mockImplementation(() => makeClient({
      submitJob: async (params) => {
        capturedPayload = params.input;
        return { id: 'job-xyz', status: 'pending' };
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({
      flags: { handler: 'foo#default', input: '{"key":"val"}' },
    }));

    expect(result.ok).toBe(true);
    expect(capturedPayload).toEqual({ key: 'val' });
  });

  it('CJR-04: --input with invalid JSON returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({
      flags: { handler: 'foo#default', input: '{not-valid-json' },
    }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CJR-05: --wait polls until completed, returns exitCode 0', async () => {
    MockedClient.mockImplementation(() => makeClient({
      submitJob: async () => ({ id: 'job-wait', status: 'pending' }),
      getJobStatus: async () => ({
        id: 'job-wait',
        type: 'workflow',
        status: 'completed',
        createdAt: new Date().toISOString(),
      }),
    }));

    vi.useFakeTimers();

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const resultPromise = jobRunCommand.execute(ctx, mockCLIInput({
      flags: { handler: 'foo#default', wait: true },
    }));

    await vi.advanceTimersByTimeAsync(2100);
    const result = await resultPromise;

    expect(result.ok).toBe(true);
  });

  it('CJR-06: missing --handler returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CJR-07: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      submitJob: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await jobRunCommand.execute(ctx, mockCLIInput({ flags: { handler: 'foo#default' } }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
