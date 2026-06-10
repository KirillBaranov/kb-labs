import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockContext } from '@kb-labs/shared-testing-e2e/cli';

vi.mock('../../http-client.js', () => ({
  getWorkflowDaemonUrl: () => 'http://localhost:7778',
}));

import handler from '../../rest/workflow-run-cancel-handler.js';

const makeInput = (runId: string | undefined) => ({
  params: runId !== undefined ? { runId } : {},
  body: undefined,
  query: undefined,
});

const makeJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workflow-run-cancel-handler (REST)', () => {
  it('RCH-01: happy path — returns { runId, cancelled: true }', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeJsonResponse({ ok: true, data: { runId: 'run-123', cancelled: true } }),
    );

    const ctx = createMockContext();
    const result = await handler.execute(ctx, makeInput('run-123'));

    expect(result).toEqual({ runId: 'run-123', cancelled: true });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:7778/api/v1/runs/run-123/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('RCH-02: 409 (already finished) — throws with daemon error message, not raw JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeJsonResponse({ error: 'Run has already completed' }, 409),
    );

    const ctx = createMockContext();
    await expect(handler.execute(ctx, makeInput('run-done'))).rejects.toThrow(
      'Run has already completed',
    );
  });

  it('RCH-03: 404 (not found) — throws with daemon error message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeJsonResponse({ error: 'Run not found' }, 404),
    );

    const ctx = createMockContext();
    await expect(handler.execute(ctx, makeInput('run-ghost'))).rejects.toThrow('Run not found');
  });

  it('RCH-04: missing runId — throws before calling daemon', async () => {
    const ctx = createMockContext();
    await expect(handler.execute(ctx, makeInput(undefined))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('RCH-05: daemon unreachable — throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const ctx = createMockContext();
    await expect(handler.execute(ctx, makeInput('run-123'))).rejects.toThrow('ECONNREFUSED');
  });
});
