import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`
const NONEXISTENT_ID = 'e2e-no-such-job-00000000'

// Jobs routes are only registered when a cronManager is configured.
// Tests skip gracefully with 404 if jobs are not available in this environment.
// Envelope middleware wraps responses: { ok: true, data: <payload>, meta: {...} }

test('RA-JB-01: GET /jobs returns 200 with a jobs array', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs`)
  if (res.status() === 404) {
    test.skip(true, 'Jobs endpoint not registered — cronManager not configured')
    return
  }
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  const jobs = data.jobs ?? data
  expect(Array.isArray(jobs)).toBe(true)
})

test('RA-JB-02: GET /jobs?status=active returns 200 and only active jobs', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs?status=active`)
  if (res.status() === 404) {
    test.skip(true, 'Jobs endpoint not registered')
    return
  }
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  const jobs: Array<{ status: string }> = data.jobs ?? data
  expect(Array.isArray(jobs)).toBe(true)
  for (const job of jobs) {
    expect(job.status).toBe('active')
  }
})

test('RA-JB-03: GET /jobs/stats returns 200 with total count', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/stats`)
  if (res.status() === 404) {
    test.skip(true, 'Jobs stats endpoint not registered')
    return
  }
  expect(res.status()).toBe(200)
  const body = await res.json()
  const data = body.data ?? body
  const stats = data.stats ?? data
  expect(typeof stats.total).toBe('number')
  expect(stats.total).toBeGreaterThanOrEqual(0)
})

test('RA-JB-04: GET /jobs/stats jobs field is an array', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/stats`)
  if (res.status() === 404) {
    test.skip(true, 'Jobs stats endpoint not registered')
    return
  }
  const body = await res.json()
  const data = body.data ?? body
  const stats = data.stats ?? data
  expect(Array.isArray(stats.jobs)).toBe(true)
})

test('RA-JB-05: GET /jobs/:id for non-existent job returns 404', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/${NONEXISTENT_ID}`)
  // 404 either because jobs not registered OR job not found — both valid
  expect([404]).toContain(res.status())
})

test('RA-JB-06: GET /jobs/:id 404 response uses consistent error shape', async ({ request }) => {
  const res = await request.get(`${BASE}/jobs/${NONEXISTENT_ID}`)
  expect(res.status()).toBe(404)
  const body = await res.json()
  const hasEnvelopeError = body.ok === false && body.error
  const hasFastifyError = body.statusCode === 404 && body.error
  const hasMessage = typeof body.message === 'string'
  expect(hasEnvelopeError || hasFastifyError || hasMessage).toBe(true)
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
