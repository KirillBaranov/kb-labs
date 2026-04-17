import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

// Workflow job API: POST /api/v1/workflows/:id/runs, GET /api/v1/jobs/:jobId
// Responses: { ok: true, data: { jobId, ... } }

async function getFirstWorkflow(request: Parameters<Parameters<typeof test>[1]>[0]['request']) {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const body = await res.json()
  const workflows: { id?: string; name?: string }[] = body.data?.workflows ?? body.data ?? body.workflows ?? []
  return Array.isArray(workflows) ? workflows[0] : undefined
}

test('W-01: create workflow run returns job ID', async ({ request }) => {
  const first = await getFirstWorkflow(request)
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  expect([200, 201]).toContain(create.status())

  const body = await create.json()
  const jobId = body.data?.jobId ?? body.data?.id ?? body.jobId ?? body.id
  expect(jobId).toBeTruthy()

  const status = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
  expect(status.status()).toBe(200)
})

test('W-02: GET /jobs/:id returns job status', async ({ request }) => {
  const first = await getFirstWorkflow(request)
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  const createBody = await create.json()
  const jobId = createBody.data?.jobId ?? createBody.data?.id ?? createBody.jobId
  test.skip(!jobId, 'Could not create workflow run')

  const res = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
  const job = await res.json()
  const status = job.data?.status ?? job.status
  expect(status).toMatch(/pending|running|queued|completed/)
})

test('W-03: workflow reaches completed within 30s', async () => { test.skip(true, 'not yet implemented') })
test('W-04: failed workflow returns failed status with error details', async () => { test.skip(true, 'not yet implemented') })
