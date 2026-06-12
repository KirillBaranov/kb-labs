import { test, expect } from '@playwright/test';
import { WORKFLOW } from '@kb-labs/e2e-shared/urls.js';

// Observability e2e tests.
// Covers: short run ID resolution (OBS-001..003) and hasPendingApproval (OBS-004..005).

async function startRun(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  workflowId: string,
): Promise<string> {
  const res = await request.post(
    `${WORKFLOW}/api/v1/workflows/${encodeURIComponent(workflowId)}/runs`,
    { data: {} },
  );
  expect([200, 201]).toContain(res.status());
  const body = await res.json();
  const runId: string = body.data?.runId ?? body.data?.id ?? body.runId;
  expect(runId).toBeTruthy();
  return runId;
}

// ── OBS-E2E-01: GET /runs/:8charPrefix returns the run ───────────────────────

test('OBS-E2E-01: GET /runs/:prefix — 8-char prefix resolves to full run', async ({ request }) => {
  const runId = await startRun(request, 'e2e-hello');
  const prefix = runId.slice(0, 8);

  const res = await request.get(`${WORKFLOW}/api/v1/runs/${prefix}`);
  expect(res.status()).toBe(200);

  const body = await res.json();
  const run = body.data?.run ?? body.data ?? body;
  expect(run.id).toBe(runId);
});

// ── OBS-E2E-02: GET /runs/:8charPrefix/logs resolves correctly ───────────────

test('OBS-E2E-02: GET /runs/:prefix/logs — resolves short ID', async ({ request }) => {
  const runId = await startRun(request, 'e2e-hello');
  const prefix = runId.slice(0, 8);

  // Wait a moment so logs have a chance to appear
  await new Promise(r => setTimeout(r, 2000));

  const res = await request.get(`${WORKFLOW}/api/v1/runs/${prefix}/logs`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

// ── OBS-E2E-03: POST /runs/:8charPrefix/cancel resolves correctly ────────────

test('OBS-E2E-03: POST /runs/:prefix/cancel — resolves short ID', async ({ request }) => {
  const runId = await startRun(request, 'e2e-hello');
  const prefix = runId.slice(0, 8);

  // Cancel immediately — run may already be terminal (409) or still running (200)
  const res = await request.post(`${WORKFLOW}/api/v1/runs/${prefix}/cancel`);
  expect([200, 409]).toContain(res.status());
  // Crucially: must not be 404 (which was the bug before the fix)
  expect(res.status()).not.toBe(404);
});

// ── OBS-E2E-04: GET /runs includes hasPendingApproval field ─────────────────

test('OBS-E2E-04: GET /runs — hasPendingApproval field present on each run', async ({ request }) => {
  // Ensure at least one run exists
  await startRun(request, 'e2e-hello');

  const res = await request.get(`${WORKFLOW}/api/v1/runs?limit=5`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const runs: Array<{ hasPendingApproval?: unknown }> = body.data?.runs ?? body.data ?? body.runs ?? [];
  expect(runs.length).toBeGreaterThan(0);

  for (const run of runs) {
    expect(typeof run.hasPendingApproval).toBe('boolean');
  }
});

// ── OBS-E2E-05: hasPendingApproval is false for non-approval runs ────────────

test('OBS-E2E-05: hasPendingApproval is false for e2e-hello run', async ({ request }) => {
  const runId = await startRun(request, 'e2e-hello');

  const res = await request.get(`${WORKFLOW}/api/v1/runs?limit=50`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const runs: Array<{ id?: string; hasPendingApproval?: boolean }> = body.data?.runs ?? body.data ?? body.runs ?? [];

  const run = runs.find(r => r.id === runId);
  expect(run).toBeDefined();
  expect(run!.hasPendingApproval).toBe(false);
});

// ── OBS-E2E-06: hasPendingApproval is true for run blocked on approval ───────

test('OBS-E2E-06: hasPendingApproval is true when run is waiting for approval', async ({ request }) => {
  test.setTimeout(60_000);

  const runId = await startRun(request, 'e2e-approval');

  // Wait until the approval step is reached
  await expect.poll(
    async () => {
      const res = await request.get(`${WORKFLOW}/api/v1/runs?limit=50`);
      const body = await res.json();
      const runs: Array<{ id?: string; hasPendingApproval?: boolean }> = body.data?.runs ?? [];
      return runs.find(r => r.id === runId)?.hasPendingApproval;
    },
    { timeout: 30_000, intervals: [500, 1000, 2000] },
  ).toBe(true);
});

// ── OBS-E2E-07: GET /runs/:unknown-id returns 404, not 500 ──────────────────

test('OBS-E2E-07: GET /runs/:nonexistent — returns 404', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/runs/00000000`);
  expect(res.status()).toBe(404);
});
