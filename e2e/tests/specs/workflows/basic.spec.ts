import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

// Workflow daemon job API: POST /api/v1/jobs, GET /api/v1/jobs/:jobId
// Responses: { ok: true, data: { jobId, ... } }

test('W-01: create workflow run returns job ID', async ({ request }) => {
  const create = await request.post(`${WORKFLOW}/api/v1/jobs`, {
    data: { name: 'e2e-basic-test' },
  })
  expect([200, 201]).toContain(create.status())

  const body = await create.json()
  const jobId = body.data?.jobId ?? body.data?.id ?? body.jobId ?? body.id
  expect(jobId).toBeTruthy()

  const status = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
  expect(status.status()).toBe(200)
})

test('W-02: GET /jobs/:id returns job status', async ({ request }) => {
  const create = await request.post(`${WORKFLOW}/api/v1/jobs`, {
    data: { name: 'e2e-status-test' },
  })
  const createBody = await create.json()
  const jobId = createBody.data?.jobId ?? createBody.data?.id ?? createBody.jobId
  const res = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
  const job = await res.json()
  const status = job.data?.status ?? job.status
  expect(status).toMatch(/pending|running|queued|completed/)
})

test('W-03: workflow reaches completed within 30s', async () => { test.skip(true, 'not yet implemented') })
test('W-04: failed workflow returns failed status with error details', async () => { test.skip(true, 'not yet implemented') })
