import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'

test('GW-OB-01: GET /ready returns 200 or 503, not a crash', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/ready`)
  expect([200, 503]).toContain(res.status())
})

test('GW-OB-02: GET /metrics returns Prometheus text format', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const text = await res.text()
  expect(text).toMatch(/^#|^\w/m)
})

test('GW-OB-03: GET /observability/describe returns JSON contract', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/observability/describe`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toBeTruthy()
})

test('GW-OB-04: GET /observability/health returns JSON without crashing', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/observability/health`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(body).toBeTruthy()
})
