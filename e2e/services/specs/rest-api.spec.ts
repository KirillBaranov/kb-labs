import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

// ── Jobs (/api/v1/jobs — basePath prefix required, routes not dual-registered) ─

test('RA-01: GET /api/v1/jobs returns jobs array', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/jobs`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.jobs)).toBe(true)
})

test('RA-02: GET /api/v1/jobs/stats returns stats object with total', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/jobs/stats`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(typeof body.stats?.total).toBe('number')
})

test('RA-03: GET /api/v1/jobs/:id with unknown id returns 404', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/jobs/nonexistent-job-e2e`)
  expect(res.status()).toBe(404)
})

// ── Observability ─────────────────────────────────────────────────────────────

test('RA-04: GET /observability/health returns health status', async ({ request }) => {
  const res = await request.get(`${REST}/observability/health`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // REST API wraps: { ok, data } or direct { status }
  const status = body.data?.status ?? body.status
  expect(status).toMatch(/ok|healthy|ready/)
})

test('RA-05: GET /observability/state-broker returns data or 503', async ({ request }) => {
  const res = await request.get(`${REST}/observability/state-broker`)
  // 200 = state broker up; 503 = down but route responds
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(typeof body.ok).toBe('boolean')
})

// ── Analytics ─────────────────────────────────────────────────────────────────

test('RA-06: GET /analytics/stats returns 200 or 501', async ({ request }) => {
  const res = await request.get(`${REST}/analytics/stats`)
  // 501 when analytics backend not configured, 200 when available
  expect([200, 501]).toContain(res.status())
})

test('RA-07: GET /analytics/buffer/status returns 200 or 501', async ({ request }) => {
  const res = await request.get(`${REST}/analytics/buffer/status`)
  expect([200, 501]).toContain(res.status())
})

// ── Adapters ──────────────────────────────────────────────────────────────────

test('RA-08: GET /adapters/llm/usage returns usage data', async ({ request }) => {
  const res = await request.get(`${REST}/adapters/llm/usage`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Envelope: { ok: true, data: ... } or direct object
  expect(body.ok ?? body).toBeTruthy()
})
