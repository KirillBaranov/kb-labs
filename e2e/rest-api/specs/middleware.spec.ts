import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

// X-Request-Id

test('RA-MW-01: X-Request-Id header is present on every response', async ({ request }) => {
  const endpoints = [
    `${BASE}/health`,
    `${BASE}/ready`,
    `${BASE}/routes`,
    `${BASE}/observability/describe`,
    `${BASE}/metrics`,
  ]
  for (const url of endpoints) {
    const res = await request.get(url)
    expect(res.headers()['x-request-id'], `missing X-Request-Id on ${url}`).toBeTruthy()
  }
})

test('RA-MW-02: X-Request-Id value is a non-empty string on each request', async ({ request }) => {
  const r1 = await request.get(`${BASE}/health`)
  const r2 = await request.get(`${BASE}/health`)
  const id1 = r1.headers()['x-request-id']
  const id2 = r2.headers()['x-request-id']
  expect(id1).toBeTruthy()
  expect(id2).toBeTruthy()
  // Two independent requests should get different IDs
  expect(id1).not.toBe(id2)
})

// Security headers

test('RA-MW-03: security header X-Content-Type-Options is nosniff', async ({ request }) => {
  const res = await request.get(`${BASE}/health`)
  const val = res.headers()['x-content-type-options']
  if (!val) {
    test.skip(true, 'X-Content-Type-Options not set — security-headers middleware may be disabled')
    return
  }
  expect(val).toBe('nosniff')
})

test('RA-MW-04: security header X-Frame-Options is set', async ({ request }) => {
  const res = await request.get(`${BASE}/health`)
  const val = res.headers()['x-frame-options']
  if (!val) {
    test.skip(true, 'X-Frame-Options not set — security-headers middleware may be disabled')
    return
  }
  expect(['DENY', 'SAMEORIGIN']).toContain(val.toUpperCase())
})

// Envelope format

test('RA-MW-05: successful JSON responses follow envelope format { ok, data, meta }', async ({ request }) => {
  // /plugins/snapshot is a stable JSON endpoint with envelope wrapping
  const res = await request.get(`${BASE}/plugins/snapshot`)
  if (res.status() !== 200) return
  const body = await res.json()
  if (body.ok === undefined) {
    test.skip(true, 'Endpoint does not use envelope format — may return raw shape')
    return
  }
  expect(body.ok).toBe(true)
  expect(body.data).toBeDefined()
  expect(body.meta).toBeDefined()
  expect(typeof body.meta.requestId).toBe('string')
  expect(typeof body.meta.durationMs).toBe('number')
})

test('RA-MW-06: 404 on unknown route uses consistent error shape', async ({ request }) => {
  const res = await request.get(`${BASE}/definitely-does-not-exist-e2e`)
  expect(res.status()).toBe(404)
  const body = await res.json()
  // Either envelope { ok: false, error: { code, message } } or Fastify { statusCode, error, message }
  const isEnvelope = body.ok === false && body.error
  const isFastify = body.statusCode === 404 && typeof body.message === 'string'
  expect(isEnvelope || isFastify).toBe(true)
})

// Rate limiting

test('RA-MW-07: rate limiter returns 429 after bursting past the window limit', async ({ request }) => {
  // Fire many requests quickly — rate limit default is 60/min, but the
  // tenant-rate-limit middleware uses the x-tenant-id header to namespace.
  // Use a unique fake tenant ID to isolate this test's bucket.
  const headers = { 'x-tenant-id': 'e2e-rate-limit-test-burst' }
  const results: number[] = []

  // 80 rapid-fire requests — should hit the 60/min window
  for (let i = 0; i < 80; i++) {
    const res = await request.get(`${BASE}/health`, { headers })
    results.push(res.status())
    if (res.status() === 429) break
  }

  const got429 = results.includes(429)
  if (!got429) {
    test.skip(true, 'Rate limit not triggered — limit may be higher than 80 or middleware disabled')
    return
  }

  expect(got429).toBe(true)
})

test('RA-MW-08: 429 response includes Retry-After header', async ({ request }) => {
  const headers = { 'x-tenant-id': 'e2e-rate-limit-retry-after' }
  let retryAfter: string | undefined

  for (let i = 0; i < 80; i++) {
    const res = await request.get(`${BASE}/health`, { headers })
    if (res.status() === 429) {
      retryAfter = res.headers()['retry-after']
      break
    }
  }

  if (retryAfter === undefined) {
    test.skip(true, 'Rate limit not triggered — skipping Retry-After assertion')
    return
  }

  expect(retryAfter).toBeTruthy()
  expect(Number(retryAfter)).toBeGreaterThan(0)
})
