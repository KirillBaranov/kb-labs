import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsWatchCommand from '../../commands/runs-watch.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

/** Builds a minimal ReadableStream that emits SSE-formatted lines then closes. */
function makeSseStream(events: Array<{ type: string; payload?: Record<string, unknown> }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events
    .map((e) => `data: ${JSON.stringify({ type: e.type, payload: e.payload ?? {} })}\n\n`)
    .join('');

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Mocks globalThis.fetch to return a streaming SSE response. */
function mockFetchWithSse(events: Array<{ type: string; payload?: Record<string, unknown> }>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: makeSseStream(events),
  }));
}

beforeEach(() => {
  MockedClient.mockReset();
  MockedClient.mockImplementation(() => makeClient({
    getRunEventsUrl: (runId: string) => `http://localhost:7778/api/v1/runs/${runId}/events`,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workflow:runs-watch', () => {
  it('CW-01: missing runId — error message, exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsWatchCommand.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CW-02: streams events until run.finished, exits with 0', async () => {
    mockFetchWithSse([
      { type: 'run.snapshot', payload: { status: 'running' } },
      { type: 'run.finished', payload: { status: 'success' } },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsWatchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'] }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.writes.some((w) => w.includes('run.finished') || w.includes('SUCCESS'))).toBe(true);
  });

  it('CW-03: run.failed terminal event exits with 1', async () => {
    mockFetchWithSse([
      { type: 'run.failed', payload: { status: 'failed', error: 'timeout' } },
    ]);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsWatchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'] }),
    );

    expect(result.exitCode).toBe(1);
  });

  it('CW-04: --json flag emits JSON objects per event', async () => {
    mockFetchWithSse([
      { type: 'run.snapshot', payload: { status: 'running' } },
      { type: 'run.finished', payload: { status: 'success' } },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsWatchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true } }),
    );

    expect(captured.json.length).toBeGreaterThan(0);
    expect((captured.json[0] as { event: unknown }).event).toBeTruthy();
  });

  it('CW-05: daemon connection refused — error message, exitCode 1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsWatchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'] }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CW-06: log.appended events are forwarded to ctx.ui.log()', async () => {
    mockFetchWithSse([
      { type: 'log.appended', payload: { level: 'info', message: 'Step started' } },
      { type: 'run.finished', payload: { status: 'success' } },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await runsWatchCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'] }));

    expect(captured.logs.some((l) => l.message.includes('Step started'))).toBe(true);
  });
});
