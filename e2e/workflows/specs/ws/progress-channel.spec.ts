import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { withWs, expectWsMessage, GATEWAY, WORKFLOW } from '@kb-labs/sdk/e2e';

const GATEWAY_WS = GATEWAY.replace(/^http/, 'ws');

// ── helpers ──────────────────────────────────────────────────────────────────

async function startRun(request: APIRequestContext): Promise<string> {
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`);
  const catalog = await catalogRes.json();
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? [];
  const wf = workflows.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? workflows[0];
  const id = wf?.id ?? wf?.name;
  if (!id) throw new Error('No workflow found in catalog');

  const runRes = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} });
  const body = await runRes.json();
  const runId: string = body.data?.runId ?? body.data?.id ?? body.runId;
  if (!runId) throw new Error(`Failed to start run: ${JSON.stringify(body)}`);
  return runId;
}

function progressWsUrl(jobId: string): string {
  return `${GATEWAY_WS}/api/v1/ws/plugins/workflow/progress/${jobId}`;
}

// ── tests ─────────────────────────────────────────────────────────────────────

// WS-P01 tests current behavior: progress-channel sends a synthetic step_start for
// 'initialization' as a placeholder. Testing the stub is intentional — if the real
// engine integration lands, the test will fail and be updated to match the new contract.
test('WS-P01: subscribe → server acknowledges (partial implementation)', async ({ request }) => {
  const runId = await startRun(request);

  await withWs(progressWsUrl(runId), async (ws) => {
    ws.send({ type: 'subscribe', jobId: runId });

    // The current implementation sends a synthetic step_start for 'initialization'
    // or an error. Either response is acceptable — what matters is that the channel
    // does not hang silently.
    const msg = await expectWsMessage<{ type: string }>(
      ws,
      (m) => m.type === 'step_start' || m.type === 'error',
      { timeoutMs: 10_000, label: 'step_start or error acknowledgement' },
    );

    expect(['step_start', 'error']).toContain(msg.type);
  });
});

test('WS-P02: unknown jobId → error message, no hang', async () => {
  const fakeJobId = 'nonexistent-job-xyz';

  await withWs(progressWsUrl(fakeJobId), async (ws) => {
    ws.send({ type: 'subscribe', jobId: fakeJobId });

    // The server should respond with an error message or close the connection
    // within a reasonable time. Hanging silently is not acceptable.
    const msg = await expectWsMessage<{ type: string; error?: string }>(
      ws,
      (m) => m.type === 'error',
      { timeoutMs: 5_000, label: 'error message for unknown job' },
    );

    expect(msg.type).toBe('error');
  });
});
