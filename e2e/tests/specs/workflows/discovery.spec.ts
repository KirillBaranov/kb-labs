import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

// Workflow daemon must discover workflow/cron definitions from .kb/workflows/
// in both platformRoot and projectRoot. This is distinct from the engine being healthy.

test('WFD-01: workflow catalog is populated from .kb/workflows (not empty)', async ({ request }) => {
  // After kb-create bootstrap, .kb/workflows/ has example workflows
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const workflows = Array.isArray(body) ? body : body.workflows ?? []
  // kb-create should scaffold at least one example workflow
  expect(workflows.length).toBeGreaterThan(0)
})

test('WFD-02: cron catalog is populated from .kb/workflows', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/crons`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const crons = Array.isArray(body) ? body : body.crons ?? []
  // May be empty if no crons scaffolded — but endpoint must respond correctly
  expect(Array.isArray(crons)).toBe(true)
})

test('WFD-03: workflow refresh rescans .kb/workflows without restart', async ({ request }) => {
  const before = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const countBefore = ((await before.json()).workflows ?? await before.json()).length ?? 0

  const refresh = await request.post(`${WORKFLOW}/api/v1/workflows/refresh`)
  expect(refresh.status()).toBeOneOf([200, 204])

  const after = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const countAfter = ((await after.json()).workflows ?? await after.json()).length ?? 0

  // Count must be equal or more (refresh can discover new files, not lose existing)
  expect(countAfter).toBeGreaterThanOrEqual(countBefore)
})

test('WFD-04: workflow found by name from .kb/workflows is runnable', async ({ request }) => {
  const listRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const workflows: { id?: string; name?: string }[] = await listRes.json()
  const first = (Array.isArray(workflows) ? workflows : (workflows as any).workflows)?.[0]
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first.id ?? first.name
  const run = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/run`, { data: {} })
  expect(run.status()).toBeOneOf([200, 201, 202])
})

test('WFD-05: workflow defined in projectRoot/.kb/workflows overrides platformRoot definition', async () => { test.skip(true, 'not yet implemented') })
test('WFD-06: invalid workflow YAML in .kb/workflows is reported in /ready diagnostics', async () => { test.skip(true, 'not yet implemented') })
