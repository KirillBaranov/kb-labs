import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import workflowRunCommand from '../../commands/workflow-run.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:run', () => {
  it('CR-01: submits workflow and returns runId', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-123', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success[0]?.message).toBeTruthy();
  });

  it('CR-02: --json returns { ok: true, data: { runId, status } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-123', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { runId: 'r-123', status: 'queued' } });
  });

  it('CR-03: --input passes JSON payload to runWorkflow', async () => {
    let capturedRequest: unknown;
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async (_id: string, req: unknown) => {
        capturedRequest = req;
        return { runId: 'r-123', status: 'queued' };
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello', input: '{"key":"val"}' } }),
    );

    expect((capturedRequest as { input?: unknown })?.input).toEqual({ key: 'val' });
  });

  it('CR-04: missing --workflow-id returns exitCode 1 with error', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-x', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-05: daemon unavailable — readable error, exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-06: invalid --isolation value returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-x', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello', isolation: 'invalid-mode' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
