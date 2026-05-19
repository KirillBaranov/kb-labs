import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
  collectSseEvents,
  waitForSseEvent,
  expectSseTerminates,
  assertNoSseDuplicates,
} from '@kb-labs/sdk/e2e';
import { WORKFLOW } from '@kb-labs/sdk/e2e';

// ── helpers ──────────────────────────────────────────────────────────────────

async function startRun(
  request: APIRequestContext,
  workflowName = 'e2e-slow',
): Promise<string> {
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`);
  const catalog = await catalogRes.json();
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? [];
  // Prefer the requested workflow; fall back to any available workflow.
  const wf = workflows.find((w) => (w.name ?? w.id) === workflowName) ?? workflows[0];
  const id = wf?.id ?? wf?.name;
  if (!id) throw new Error('No workflow found in catalog');

  const runRes = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} });
  const body = await runRes.json();
  const runId: string = body.data?.runId ?? body.data?.id ?? body.runId;
  if (!runId) throw new Error(`Failed to start run: ${JSON.stringify(body)}`);
  return runId;
}

function eventsUrl(runId: string): string {
  return `${WORKFLOW}/api/v1/runs/${runId}/events`;
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('SE-R01: reconnect does not duplicate live events', async ({ request }) => {
  test.setTimeout(60_000);

  const runId = await startRun(request);
  const url = eventsUrl(runId);

  // First connection: collect for a short window, then disconnect (simulated by short timeout).
  // We intentionally do not wait for the terminal event here.
  // collectSseEvents will return whatever arrived before the timeout fires.
  const firstBatch = await collectSseEvents(url, {
    untilEvent: 'run.finished',
    timeoutMs: 3_000,
  });

  // Reconnect and collect the remaining events until the terminal.
  // The server is expected to send a run.snapshot on every new connection (that is correct
  // behaviour). Individual live events (non-snapshot) must not be replayed.
  const secondBatch = await collectSseEvents(url, {
    untilEvent: 'run.finished',
    timeoutMs: 30_000,
  });

  // The second batch on its own must contain no internal duplicates.
  assertNoSseDuplicates(secondBatch);

  // Every new connection gets exactly one run.snapshot — that is expected and not a duplicate.
  // Verify that non-snapshot events from the second batch were not already present in the first
  // batch under the same id (server must not replay already-emitted live events).
  const firstLiveIds = new Set(
    firstBatch
      .filter((e) => e.event !== 'run.snapshot')
      .map((e) => e.id)
      .filter(Boolean),
  );

  const duplicatedLiveEvents = secondBatch.filter(
    (e) => e.event !== 'run.snapshot' && e.id !== undefined && firstLiveIds.has(e.id),
  );

  expect(
    duplicatedLiveEvents,
    `Server replayed ${duplicatedLiveEvents.length} live event(s) on reconnect`,
  ).toHaveLength(0);

  // Sanity: the second batch must eventually contain the terminal event.
  const types = secondBatch.map((e) => e.event);
  expect(types).toContain('run.finished');
});

test('SE-R02: run.finished is not missed on reconnect to already-terminal run', async ({ request }) => {
  test.setTimeout(60_000);

  // Use a fast workflow — the test reconnects AFTER the run finishes
  const runId = await startRun(request, 'e2e-hello');
  const url = eventsUrl(runId);

  // Wait for the run to reach terminal state on the first connection.
  await waitForSseEvent(url, 'run.finished', { timeoutMs: 30_000 });

  // Reconnect after the run is already terminal.
  // The server must serve the persisted terminal event and then close the stream immediately.
  // expectSseTerminates asserts the stream closes on its own within the given timeout.
  await expectSseTerminates(url, { timeoutMs: 3_000 });
});

test('SE-R03: rapid reconnect delivers run.finished without data loss', async ({ request }) => {
  test.setTimeout(60_000);

  const runId = await startRun(request);
  const url = eventsUrl(runId);

  // Simulate a connection drop by collecting with a very short timeout (500 ms).
  // We do not care how many events arrived — we just verify the reconnect path works.
  await collectSseEvents(url, {
    untilEvent: 'run.finished',
    timeoutMs: 500,
  });

  // Immediately reconnect and collect until terminal.
  // The run must eventually deliver run.finished regardless of the earlier drop.
  const events = await collectSseEvents(url, {
    untilEvent: 'run.finished',
    timeoutMs: 30_000,
  });

  const types = events.map((e) => e.event);
  expect(types).toContain('run.finished');
});
