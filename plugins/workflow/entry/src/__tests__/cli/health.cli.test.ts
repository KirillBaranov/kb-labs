import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

// Mock WorkflowDaemonClient before importing the command
vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import healthCommand from '../../commands/health.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:health', () => {
  it('CH-01: prints success message when daemon is healthy', async () => {
    MockedClient.mockImplementation(() => makeClient({
      health: async () => ({ ok: true, service: 'workflow' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await healthCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('healthy');
  });

  it('CH-02: --json returns { ok: true, data: { ok, service } }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      health: async () => ({ ok: true, service: 'workflow' }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await healthCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { ok: true, service: 'workflow' } });
  });

  it('CH-03: daemon unavailable — prints error, returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      health: async () => { throw new Error('ECONNREFUSED'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await healthCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
