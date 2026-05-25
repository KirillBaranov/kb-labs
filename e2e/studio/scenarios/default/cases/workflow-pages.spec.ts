import { test, expect } from '@playwright/test';
import { GATEWAY, WORKFLOW } from '@kb-labs/e2e-shared/urls.js';

/**
 * Studio workflow pages smoke tests.
 *
 * Checks that:
 * 1. The MF manifest exposes a workflow plugin entry
 * 2. The Studio SPA shell loads for all workflow routes (no hard 404)
 * 3. The workflow daemon API endpoints consumed by Studio pages respond correctly
 *
 * Tests skip gracefully when Studio or the workflow daemon is not running.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

async function studioIsUp(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<boolean> {
  try {
    const res = await request.get(`${GATEWAY}/`, { timeout: 3000 });
    return res.status() === 200;
  } catch {
    return false;
  }
}

async function workflowIsUp(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<boolean> {
  try {
    const res = await request.get(`${WORKFLOW}/health`, { timeout: 3000 });
    return res.status() === 200;
  } catch {
    return false;
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('SW-01: MF manifest contains a workflow plugin entry', async ({ request }) => {
  const manifestRes = await request.get(`${GATEWAY}/mf-manifest.json`);
  test.skip(manifestRes.status() === 404, 'Studio MF manifest not available');
  expect(manifestRes.status()).toBe(200);

  const manifest = await manifestRes.json();

  // Collect all keys to search for a workflow-related entry
  const keys = Object.keys(manifest?.remotes ?? manifest?.modules ?? manifest ?? {});
  const hasWorkflow = keys.some((k) =>
    k.toLowerCase().includes('workflow') || k.toLowerCase().includes('wf'),
  );

  // Not every installation will have the workflow plugin loaded in the manifest,
  // but if manifest has entries, workflow should be among them.
  test.skip(keys.length === 0, 'Manifest has no remote entries — single-bundle mode');
  expect(hasWorkflow).toBe(true);
});

test('SW-02: Studio SPA shell responds for /workflows route', async ({ request }) => {
  const up = await studioIsUp(request);
  test.skip(!up, 'Studio not available — run kb-dev start');

  // In a SPA all routes serve the same index.html — 404 would mean the route
  // is not caught by the gateway proxy/static fallback.
  const res = await request.get(`${GATEWAY}/workflows`);
  expect([200, 301, 302]).toContain(res.status());
  if (res.status() === 200) {
    const text = await res.text();
    expect(text.toLowerCase()).toContain('<html');
  }
});

test('SW-03: Studio SPA shell responds for /workflows/runs route', async ({ request }) => {
  const up = await studioIsUp(request);
  test.skip(!up, 'Studio not available — run kb-dev start');

  const res = await request.get(`${GATEWAY}/workflows/runs`);
  expect([200, 301, 302]).toContain(res.status());
});

test('SW-04: Workflow daemon API — /api/v1/runs used by runs list page', async ({ request }) => {
  const up = await workflowIsUp(request);
  test.skip(!up, 'Workflow daemon not running');

  const res = await request.get(`${WORKFLOW}/api/v1/runs`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const runs = body.data?.runs ?? body.data ?? body.runs;
  expect(Array.isArray(runs)).toBe(true);
});

test('SW-05: Workflow daemon API — /api/v1/workflows used by definitions page', async ({ request }) => {
  const up = await workflowIsUp(request);
  test.skip(!up, 'Workflow daemon not running');

  const res = await request.get(`${WORKFLOW}/api/v1/workflows`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const workflows = body.data?.workflows ?? body.data ?? body.workflows;
  expect(Array.isArray(workflows)).toBe(true);
});

test('SW-06: Workflow daemon API — /api/v1/cron used by cron jobs page', async ({ request }) => {
  const up = await workflowIsUp(request);
  test.skip(!up, 'Workflow daemon not running');

  const res = await request.get(`${WORKFLOW}/api/v1/crons`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const crons = body.data?.crons ?? body.crons ?? body.data ?? [];
  expect(Array.isArray(crons)).toBe(true);
});
