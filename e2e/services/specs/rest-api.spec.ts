import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

// ── Observability describe + metrics ─────────────────────────────────────────

test('RA-01: GET /observability/describe returns service contract', async ({ request }) => {
  const res = await request.get(`${REST}/observability/describe`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // ServiceObservabilityDescribe shape: { serviceId, serviceType, ... }
  expect(body.serviceId ?? body.service ?? body.name).toBeTruthy()
})

test('RA-02: GET /api/v1/metrics returns Prometheus text', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/metrics`)
  expect(res.status()).toBe(200)
  const text = await res.text()
  expect(text).toMatch(/^#|^\w/m)
})

test('RA-03: GET /openapi-plugins.json returns valid document', async ({ request }) => {
  const res = await request.get(`${REST}/openapi-plugins.json`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // May return merged OpenAPI object or array of specs — just verify it's non-empty JSON
  expect(body).toBeTruthy()
  expect(typeof body).toBe('object')
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
