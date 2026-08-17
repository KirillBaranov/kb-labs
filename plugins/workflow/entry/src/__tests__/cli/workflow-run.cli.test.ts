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

    expect(result.ok).toBe(true);
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

    expect(result.ok).toBe(true);
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

  it('CR-04: --input with nested JSON object passes full payload to runWorkflow', async () => {
    let capturedRequest: unknown;
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async (_id: string, req: unknown) => {
        capturedRequest = req;
        return { runId: 'r-123', status: 'queued' };
      },
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const payload = {
      invoice_payload: {
        vendor: 'Acme Corp',
        amount: 15000,
        currency: 'USD',
        line_items: [{ desc: 'Consulting', qty: 1, unit_price: 15000 }],
      },
    };
    await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'invoice-approval', input: JSON.stringify(payload) } }),
    );

    expect((capturedRequest as { input?: unknown })?.input).toEqual(payload);
  });

  it('CR-08: --inputs (deprecated alias) passes payload identically to --input', async () => {
    let capturedRequest: unknown;
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async (_id: string, req: unknown) => {
        capturedRequest = req;
        return { runId: 'r-123', status: 'queued' };
      },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello', inputs: '{"key":"val"}' } }),
    );

    expect((capturedRequest as { input?: unknown })?.input).toEqual({ key: 'val' });
    expect(captured.warnings.length).toBeGreaterThan(0);
  });

  it('CR-05: missing --workflow-id returns exitCode 1 with error', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-x', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-06: daemon unavailable — readable error, exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-07: invalid --isolation value returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      runWorkflow: async () => ({ runId: 'r-x', status: 'queued' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await workflowRunCommand.execute(
      ctx,
      mockCLIInput({ flags: { 'workflow-id': 'e2e-hello', isolation: 'invalid-mode' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
