import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`
const NONEXISTENT_ID = 'e2e-no-such-job-00000000'

test('RA-JB-01: GET /jobs returns 200 with a jobs array', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const jobs = body.jobs ?? body.data?.jobs ?? body.data ?? body
  expect(Array.isArray(jobs)).toBe(true)
})

test('RA-JB-02: GET /jobs?status=active returns 200 and only active jobs', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs?status=active`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const jobs: Array<{ status: string }> = body.jobs ?? body.data?.jobs ?? body.data ?? body
  expect(Array.isArray(jobs)).toBe(true)
  for (const job of jobs) {
    expect(job.status).toBe('active')
  }
})

test('RA-JB-03: GET /jobs/stats returns 200 with total count', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const stats = body.stats ?? body.data ?? body
  expect(typeof stats.total).toBe('number')
  expect(stats.total).toBeGreaterThanOrEqual(0)
})

test('RA-JB-04: GET /jobs/stats jobs field is an array', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/stats`)
  const body = await res.json()
  const stats = body.stats ?? body.data ?? body
  expect(Array.isArray(stats.jobs)).toBe(true)
})

test('RA-JB-05: GET /jobs/:id for non-existent job returns 404', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/${NONEXISTENT_ID}`)
  expect(res.status()).toBe(404)
})

test('RA-JB-06: GET /jobs/:id 404 response uses envelope error format', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/${NONEXISTENT_ID}`)
  expect(res.status()).toBe(404)
  const body = await res.json()
  // envelope: { ok: false, error: { code, message } } or Fastify error shape
  const hasEnvelopeError = body.ok === false && body.error?.code
  const hasFastifyError = body.statusCode === 404 && body.error
  expect(hasEnvelopeError || hasFastifyError).toBe(true)
})

test('RA-JB-07: POST /jobs/:id/trigger for non-existent job returns 404', async ({ request }) => {
  const res = await request.post(`${BASE}/jobs/${NONEXISTENT_ID}/trigger`)
  expect(res.status()).toBe(404)
})

test('RA-JB-08: POST /jobs/:id/pause for non-existent job returns 404', async ({ request }) => {
  const res = await request.post(`${BASE}/jobs/${NONEXISTENT_ID}/pause`)
  expect(res.status()).toBe(404)
})

test('RA-JB-09: POST /jobs/:id/resume for non-existent job returns 404', async ({ request }) => {
  const res = await request.post(`${BASE}/jobs/${NONEXISTENT_ID}/resume`)
  expect(res.status()).toBe(404)
})
