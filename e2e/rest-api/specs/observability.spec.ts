import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

test('RA-OB-01: GET /observability/describe returns 200 with serviceId and contractVersion', async ({ request }) => {
  const res = await request.get(`${BASE}/observability/describe`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.serviceId).toBe('rest')
  expect(body.contractVersion).toBeTruthy()
})

test('RA-OB-02: GET /observability/describe contains metricsEndpoint and healthEndpoint', async ({ request }) => {
  const res = await request.get(`${BASE}/observability/describe`)
  const body = await res.json()
  expect(typeof body.metricsEndpoint).toBe('string')
  expect(body.metricsEndpoint).toContain('/metrics')
  expect(typeof body.healthEndpoint).toBe('string')
  expect(body.healthEndpoint).toContain('/observability/health')
})

test('RA-OB-03: GET /observability/health returns 200 with serviceId and status', async ({ request }) => {
  const res = await request.get(`${BASE}/observability/health`)
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(body.serviceId).toBe('rest')
  expect(body.contractVersion).toBeTruthy()
  expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status)
})

test('RA-OB-04: GET /observability/health contains checks array with registry entry', async ({ request }) => {
  const res = await request.get(`${BASE}/observability/health`)
  const body = await res.json()
  expect(Array.isArray(body.checks)).toBe(true)
  const registryCheck = body.checks.find((c: { id: string }) => c.id === 'registry')
  expect(registryCheck).toBeDefined()
  expect(['ok', 'warn', 'fail']).toContain(registryCheck.status)
})

test('RA-OB-05: GET /observability/health has state field', async ({ request }) => {
  const res = await request.get(`${BASE}/observability/health`)
  const body = await res.json()
  expect(typeof body.state).toBe('string')
  expect(body.state.length).toBeGreaterThan(0)
})

test('RA-OB-06: GET /routes returns non-empty list containing health and ready', async ({ request }) => {
  const res = await request.get(`${BASE}/routes`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const routes: string[] = Array.isArray(body)
    ? body
    : (body.data ?? body.routes ?? [])
  expect(routes.length).toBeGreaterThan(0)
  const paths = routes.map((r: string | { path: string }) =>
    typeof r === 'string' ? r : r.path,
  )
  const hasHealth = paths.some((p: string) => p.includes('/health'))
  const hasReady = paths.some((p: string) => p.includes('/ready'))
  expect(hasHealth).toBe(true)
  expect(hasReady).toBe(true)
})
