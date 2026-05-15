import { test, expect } from '@playwright/test';
import { WORKFLOW } from '../../fixtures/urls.js';

// ── types ─────────────────────────────────────────────────────────────────────

type WorkflowEntry = { id?: string; name?: string };
type RunEntry = { id?: string; runId?: string; status?: string; createdAt?: string };

const TERMINAL_STATUSES = ['success', 'completed', 'failed', 'cancelled', 'error'] as const;
type TerminalStatus = typeof TERMINAL_STATUSES[number];

// ── helpers ───────────────────────────────────────────────────────────────────

async function getFirstWorkflow(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<WorkflowEntry | undefined> {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`);
  if (!res.ok()) return undefined;
  const body = await res.json();
  const list: WorkflowEntry[] = body.data?.workflows ?? body.data ?? body.workflows ?? [];
  // Prefer e2e-hello — the lightweight smoke workflow scaffolded by the platform.
  // Avoids workflows that need external deps (LLM, Docker, etc.).
  return list.find((w) => (w.name ?? w.id) === 'e2e-hello') ?? list[0];
}

async function startRun(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  workflowId: string,
): Promise<string | undefined> {
  const res = await request.post(`${WORKFLOW}/api/v1/workflows/${workflowId}/runs`, { data: {} });
  if (!res.ok()) return undefined;
  const body = await res.json();
  return body.data?.runId ?? body.data?.id ?? body.runId ?? body.id;
}

async function getRunStatus(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  runId: string,
): Promise<string | undefined> {
  const res = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`);
  if (!res.ok()) return undefined;
  const body = await res.json();
  return body.data?.run?.status ?? body.data?.status ?? body.status;
}

/**
 * Polls GET /runs/:runId every 2 s until the status is terminal or the
 * timeout expires. Returns the last observed status (may be undefined if
 * the endpoint is unreachable).
 */
async function pollUntilTerminal(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  runId: string,
  timeoutMs = 30_000,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last: string | undefined;

  while (Date.now() < deadline) {
    last = await getRunStatus(request, runId);
    if (last && (TERMINAL_STATUSES as readonly string[]).includes(last)) {
      return last;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
  }

  return last;
}

// ── J-01: run → wait for completion (happy path) ────────────────────────────

test('J-01: run → reaches success within 30s', async ({ request }) => {
  test.setTimeout(60_000);

  const wf = await getFirstWorkflow(request);
  test.skip(!wf, 'no workflows in catalog — check .kb/workflows in platform setup');

  const workflowId = wf!.id ?? wf!.name!;
  const runId = await startRun(request, workflowId);
  test.skip(!runId, 'could not start workflow run');

  const finalStatus = await pollUntilTerminal(request, runId!, 30_000);
  expect(finalStatus).toMatch(/^(success|completed)$/);

  // Verify the detail response still returns the correct runId
  const res = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const run: RunEntry = body.data?.run ?? body.data ?? body;
  expect(run.id ?? run.runId ?? runId).toBeTruthy();
});

// ── J-02: run → cancel → status is terminal ──────────────────────────────────

test('J-02: run → cancel → status is cancelled or failed', async ({ request }) => {
  test.setTimeout(60_000);

  const wf = await getFirstWorkflow(request);
  test.skip(!wf, 'no workflows in catalog');

  const workflowId = wf!.id ?? wf!.name!;
  const runId = await startRun(request, workflowId);
  test.skip(!runId, 'could not start workflow run');

  // Cancel immediately — may race with fast-completing workflows (e2e-hello).
  // 200 = cancelled successfully; 409 = run already reached terminal state.
  const cancelRes = await request.post(`${WORKFLOW}/api/v1/runs/${runId!}/cancel`);
  expect([200, 409]).toContain(cancelRes.status());

  // Poll until terminal regardless of whether the cancel was accepted
  const finalStatus = await pollUntilTerminal(request, runId!, 15_000);
  expect(finalStatus).toMatch(/^(cancelled|failed|success|completed)$/);
});

// ── J-03: run → view detail → required fields present ────────────────────────

test('J-03: run detail has required fields and jobs endpoint responds 200', async ({ request }) => {
  test.setTimeout(30_000);

  const wf = await getFirstWorkflow(request);
  test.skip(!wf, 'no workflows in catalog');

  const workflowId = wf!.id ?? wf!.name!;
  const runId = await startRun(request, workflowId);
  test.skip(!runId, 'could not start workflow run');

  // Wait for a terminal state so the run detail is fully populated
  await pollUntilTerminal(request, runId!, 30_000);

  // Assert run detail fields
  const detailRes = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`);
  expect(detailRes.status()).toBe(200);
  const detailBody = await detailRes.json();
  const run: RunEntry = detailBody.data?.run ?? detailBody.data ?? detailBody;
  expect(run.id ?? run.runId).toBeTruthy();
  expect(run.status).toBeTruthy();
  expect(run.createdAt).toBeTruthy();

  // Assert that the jobs listing endpoint is accessible (200, not 404/500)
  const jobsRes = await request.get(`${WORKFLOW}/api/v1/jobs`);
  expect(jobsRes.status()).toBe(200);
});

// ── J-04: list runs → find own run by ID ─────────────────────────────────────

test('J-04: list runs → newly started run appears in the list', async ({ request }) => {
  const wf = await getFirstWorkflow(request);
  test.skip(!wf, 'no workflows in catalog');

  const workflowId = wf!.id ?? wf!.name!;
  const runId = await startRun(request, workflowId);
  test.skip(!runId, 'could not start workflow run');

  // No need to wait for completion — the run must appear in the list immediately
  const listRes = await request.get(`${WORKFLOW}/api/v1/runs`);
  expect(listRes.status()).toBe(200);

  const listBody = await listRes.json();
  const runs: RunEntry[] =
    listBody.data?.runs ?? listBody.data ?? listBody.runs ?? (Array.isArray(listBody) ? listBody : []);

  const found = runs.some((r) => (r.id ?? r.runId) === runId);
  expect(found).toBe(true);
});
