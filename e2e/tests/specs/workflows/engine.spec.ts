import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

test('WF-01: workflow stats endpoint responds with counts', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Stats must have numeric fields — proves engine is tracking state
  expect(typeof (body.jobs?.total ?? body.totalJobs ?? body.total)).toBe('number')
})

test('WF-02: workflow list is accessible (catalog loaded)', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body) || Array.isArray(body.workflows)).toBe(true)
})

test('WF-03: create run → job reaches terminal state within 30s', async ({ request }) => {
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/runs`, {
    data: { name: 'e2e-engine-test' },
  })
  expect(create.status()).toBeOneOf([200, 201])
  const { jobId } = await create.json()

  await expect.poll(
    async () => {
      const res = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
      return (await res.json()).status
    },
    { timeout: 30_000, intervals: [1000, 2000, 3000] },
  ).toMatch(/completed|failed/)
})

test('WF-04: jobs list is accessible', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/jobs`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body) || Array.isArray(body.jobs)).toBe(true)
})

test.todo('WF-05: workflow with input params → result contains expected output')
test.todo('WF-06: workflow failure → job.status=failed with error details')
test.todo('WF-07: cron schedule creates jobs on trigger')
