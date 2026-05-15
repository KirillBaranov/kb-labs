import { test, expect } from '@playwright/test';
import {
  collectSseEvents,
  waitForSseEvent,
  expectSseTerminates,
  assertSseOrder,
  assertNoSseDuplicates,
} from '@kb-labs/shared-testing-e2e';
import { WORKFLOW } from '@kb-labs/e2e-shared/urls.js';

// ── helpers ──────────────────────────────────────────────────────────────────

async function startRun(request: Parameters<Parameters<typeof test>[1]>[0]['request']): Promise<string> {
  // Find a fast workflow (e2e-hello is scaffolded by the platform as smoke test)
  const catalogRes = await request.get(`${WORKFLOW}/api/v1/workflows`);
  const catalog = await catalogRes.json();
  const workflows: Array<{ id?: string; name?: string }> =
    catalog.data?.workflows ?? catalog.data ?? catalog.workflows ?? [];
  const wf = workflows.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? workflows[0];
  if (!wf?.id && !wf?.name) throw new Error('No workflow found in catalog');

  const id = wf.id ?? wf.name!;
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

test('SE-01: run.snapshot arrives first, terminal event closes stream', async ({ request }) => {
  const runId = await startRun(request);
  const events = await collectSseEvents(eventsUrl(runId), {
    untilEvent: 'run.finished',
    timeoutMs: 30_000,
  });

  expect(events.length).toBeGreaterThan(0);
  expect(events[0].event).toBe('run.snapshot');
  assertSseOrder(events, ['run.snapshot', 'run.finished']);
});

test('SE-02: no duplicate events in the stream', async ({ request }) => {
  const runId = await startRun(request);
  const events = await collectSseEvents(eventsUrl(runId), {
    untilEvent: 'run.finished',
    timeoutMs: 30_000,
  });

  assertNoSseDuplicates(events);
});

test('SE-03: already-terminal run closes stream immediately (< 3s)', async ({ request }) => {
  // Start run and wait for it to finish first
  const runId = await startRun(request);
  await waitForSseEvent(eventsUrl(runId), 'run.finished', { timeoutMs: 30_000 });

  // Reconnect — terminal run must close the new SSE connection quickly
  await expectSseTerminates(eventsUrl(runId), { timeoutMs: 3_000 });
});

test('SE-04: invalid runId returns 404, not an SSE stream', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/runs/nonexistent-run-id-xyz/events`);
  expect(res.status()).toBe(404);
});

test('SE-05: multiple simultaneous subscribers receive same events', async ({ request }) => {
  const runId = await startRun(request);
  const url = eventsUrl(runId);

  // Subscribe from two independent collectors concurrently
  const [eventsA, eventsB] = await Promise.all([
    collectSseEvents(url, { untilEvent: 'run.finished', timeoutMs: 30_000 }),
    collectSseEvents(url, { untilEvent: 'run.finished', timeoutMs: 30_000 }),
  ]);

  expect(eventsA.length).toBeGreaterThan(0);
  expect(eventsB.length).toBeGreaterThan(0);

  // Both must receive the same terminal event
  const typesA = eventsA.map((e) => e.event);
  const typesB = eventsB.map((e) => e.event);
  expect(typesA).toContain('run.finished');
  expect(typesB).toContain('run.finished');
});
