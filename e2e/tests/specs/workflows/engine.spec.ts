import { test, expect } from '@playwright/test'
import { WORKFLOW } from '../../fixtures/urls.js'

// Workflow daemon API uses { ok: true, data: ... } envelope

test('WF-01: workflow stats endpoint responds with counts', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const jobs = body.data?.jobs ?? body.jobs
  // Stats must have numeric job counts — proves engine is tracking state
  expect(typeof jobs?.running).toBe('number')
})

test('WF-02: workflow list is accessible (catalog loaded)', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/workflows`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const workflows = body.data?.workflows ?? body.data ?? body.workflows ?? body
  expect(Array.isArray(workflows)).toBe(true)
})

test('WF-03: create run → job reaches terminal state within 30s', async ({ request }) => {
  const listRes = await request.get(`${WORKFLOW}/api/v1/workflows`)
  const listBody = await listRes.json()
  const workflows: { id?: string; name?: string }[] = listBody.data?.workflows ?? listBody.data ?? listBody.workflows ?? []
  const first = Array.isArray(workflows) ? workflows[0] : undefined
  test.skip(!first, 'No workflows discovered — check .kb/workflows directory')

  const id = first!.id ?? first!.name
  const create = await request.post(`${WORKFLOW}/api/v1/workflows/${id}/runs`, { data: {} })
  expect([200, 201]).toContain(create.status())
  const createBody = await create.json()
  const jobId = createBody.data?.jobId ?? createBody.data?.id ?? createBody.jobId

  await expect.poll(
    async () => {
      const res = await request.get(`${WORKFLOW}/api/v1/jobs/${jobId}`)
      const job = await res.json()
      return job.data?.status ?? job.status
    },
    { timeout: 30_000, intervals: [1000, 2000, 3000] },
  ).toMatch(/completed|failed/)
})

test('WF-04: jobs list is accessible', async ({ request }) => {
  const res = await request.get(`${WORKFLOW}/api/v1/jobs`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const jobs = body.data?.jobs ?? body.data ?? body.jobs ?? body
  expect(Array.isArray(jobs)).toBe(true)
})

test('WF-05: workflow with input params → result contains expected output', async () => { test.skip(true, 'not yet implemented') })
test('WF-06: workflow failure → job.status=failed with error details', async () => { test.skip(true, 'not yet implemented') })
test('WF-07: cron schedule creates jobs on trigger', async () => { test.skip(true, 'not yet implemented') })
