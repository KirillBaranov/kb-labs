import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

test('W-01: create workflow run returns job ID', async ({ request }) => {
  const create = await request.post(`${WORKFLOW}/workflows/runs`, {
    data: { name: 'e2e-basic-test' },
  })
  expect(create.status()).toBeOneOf([200, 201])

  const body = await create.json()
  const jobId = body.jobId ?? body.id
  expect(jobId).toBeTruthy()

  const status = await request.get(`${WORKFLOW}/jobs/${jobId}`)
  expect(status.status()).toBe(200)
})

test('W-02: GET /jobs/:id returns job status', async ({ request }) => {
  const create = await request.post(`${WORKFLOW}/workflows/runs`, {
    data: { name: 'e2e-status-test' },
  })
  const { jobId } = await create.json()
  const res = await request.get(`${WORKFLOW}/jobs/${jobId}`)
  const job = await res.json()
  expect(job.status).toMatch(/pending|running|queued|completed/)
})

test('W-03: workflow reaches completed within 30s', async () => { test.skip(true, 'not yet implemented') })
test('W-04: failed workflow returns failed status with error details', async () => { test.skip(true, 'not yet implemented') })
