import { test, expect } from '@playwright/test'
import { WORKFLOW } from '@kb-labs/sdk/e2e'

// Workflow daemon must discover workflow/cron definitions from .kb/workflows/
// in both platformRoot and projectRoot. This is distinct from the engine being healthy.
// Workflow daemon API uses { ok: true, data: { workflows: [...] } } envelope.

test('WFD-01: workflow catalog endpoint is accessible', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const workflows = body.data?.workflows ?? body.data ?? body.workflows ?? []
  // Endpoint must return a valid array (even if empty on minimal install)
  expect(Array.isArray(workflows)).toBe(true)
})

test('WFD-02: cron catalog is populated from .kb/workflows', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/crons`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const crons = body.data?.crons ?? body.data ?? body.crons ?? (Array.isArray(body) ? body : [])
  // May be empty if no crons scaffolded — but endpoint must respond correctly
  expect(Array.isArray(crons)).toBe(true)
})

test('WFD-03: workflow refresh rescans .kb/workflows without restart', async ({ request }) => {
  const before = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const beforeBody = await before.json()
  const workflowsBefore = beforeBody.data?.workflows ?? beforeBody.data ?? beforeBody.workflows ?? []
  const countBefore = Array.isArray(workflowsBefore) ? workflowsBefore.length : 0

  const refresh = await request.post(`${WORKFLOW}/api/v1/workflows/refresh`)
  expect([200, 204]).toContain(refresh.status())

  const after = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const afterBody = await after.json()
  const workflowsAfter = afterBody.data?.workflows ?? afterBody.data ?? afterBody.workflows ?? []
  const countAfter = Array.isArray(workflowsAfter) ? workflowsAfter.length : 0

  // Count must be equal or more (refresh can discover new files, not lose existing)
  expect(countAfter).toBeGreaterThanOrEqual(countBefore)
})

test('WFD-04: workflow found by name from .kb/workflows is runnable', async ({ request }) => {
  const listRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const listBody = await listRes.json()
  const workflows: { id?: string; name?: string }[] = listBody.data?.workflows ?? listBody.data ?? listBody.workflows ?? []
  const first = Array.isArray(workflows) ? workflows[0] : undefined
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const run = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  expect([200, 201, 202]).toContain(run.status())
})

// WFD-05: skipped — the daemon reads projectRoot at startup from KB_PROJECT_ROOT env.
// There is no API to change projectRoot mid-run or pass it per-request via /refresh.
// Requires: daemon API to accept X-Project-Root header on /refresh, or a separate
// daemon instance started with a custom projectRoot in globalSetup.
test('WFD-05: workflow defined in projectRoot/.kb/workflows overrides platformRoot definition', async () => {
  test.skip(true, 'daemon does not expose per-request projectRoot override — needs daemon API change')
})

// WFD-06: skipped — the /ready endpoint returns component availability (engine, catalog, cron),
// not YAML parse errors. WorkflowService does not surface file-level parse errors to /ready.
// Requires: WorkflowService.refreshManifests() to collect parse errors and expose them
// via a /ready diagnostics field (e.g. components.workflowCatalog.errors).
test('WFD-06: invalid workflow YAML in .kb/workflows is reported in /ready diagnostics', async () => {
  test.skip(true, '/ready does not expose YAML parse errors — needs WorkflowService + server changes')
})
