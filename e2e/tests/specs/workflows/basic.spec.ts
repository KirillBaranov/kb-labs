import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

// Workflow runs API: POST /api/v1/workflows/:id/runs → { data: { runId, status } }
// Run status: GET /api/v1/runs/:runId → { data: { status, ... } }

async function getFirstWorkflow(request: Parameters<Parameters<typeof test>[1]>[0]['request']) {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const body = await res.json()
  const workflows: { id?: string; name?: string }[] = body.data?.workflows ?? body.data ?? body.workflows ?? []
  return Array.isArray(workflows) ? workflows[0] : undefined
}

test('W-01: create workflow run returns run ID', async ({ request }) => {
  const first = await getFirstWorkflow(request)
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  expect([200, 201]).toContain(create.status())

  const body = await create.json()
  const runId = body.data?.runId ?? body.data?.id ?? body.runId ?? body.id
  expect(runId).toBeTruthy()

  const status = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`)
  expect(status.status()).toBe(200)
})

test('W-02: GET /runs/:id returns run status', async ({ request }) => {
  const first = await getFirstWorkflow(request)
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  const createBody = await create.json()
  const runId = createBody.data?.runId ?? createBody.data?.id ?? createBody.runId
  test.skip(!runId, 'Could not create workflow run')

  const res = await request.get(`${WORKFLOW}/api/v1/runs/${runId}`)
  const run = await res.json()
  const status = run.data?.status ?? run.status
  expect(status).toMatch(/pending|running|queued|completed/)
})

test('W-03: workflow reaches completed within 30s', async () => { test.skip(true, 'not yet implemented') })
test('W-04: failed workflow returns failed status with error details', async () => { test.skip(true, 'not yet implemented') })
