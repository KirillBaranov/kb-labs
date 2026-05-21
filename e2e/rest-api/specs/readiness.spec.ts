import { test, expect } from '@playwright/test'
import { REST } from '@kb-labs/e2e-shared/urls.js'

const BASE = `${REST}/api/v1`

test('RA-RD-01: GET /ready returns 200 or 503 — never crashes', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  expect([200, 503]).toContain(res.status())
})

test('RA-RD-02: GET /ready response has kb.ready/1 schema', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  const body = await res.json()
  expect(body.schema).toBe('kb.ready/1')
})

test('RA-RD-03: GET /ready response has required top-level fields', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  const body = await res.json()
  expect(typeof body.ready).toBe('boolean')
  expect(['ready', 'degraded', 'initializing']).toContain(body.status)
  expect(typeof body.reason).toBe('string')
  expect(body.reason.length).toBeGreaterThan(0)
  expect(body.components).toBeDefined()
})

test('RA-RD-04: GET /ready components block has cliApi, registry, plugins', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  const body = await res.json()
  const c = body.components
  expect(c.cliApi).toBeDefined()
  expect(typeof c.cliApi.initialized).toBe('boolean')
  expect(c.registry).toBeDefined()
  expect(typeof c.registry.loaded).toBe('boolean')
  expect(c.plugins).toBeDefined()
  expect(typeof c.plugins.mounted).toBe('boolean')
})

test('RA-RD-05: GET /ready when 200 — ready is true and status is ready', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  if (res.status() !== 200) {
    test.skip(true, `Service not fully ready yet (${res.status()}) — skipping readiness assertion`)
    return
  }
  const body = await res.json()
  expect(body.ready).toBe(true)
  expect(body.status).toBe('ready')
  expect(body.reason).toBe('ready')
})

test('RA-RD-06: GET /ready when 503 — ready is false with a non-empty reason', async ({ request }) => {
  const res = await request.get(`${BASE}/ready`)
  if (res.status() !== 503) {
    test.skip(true, 'Service is ready — 503 path not exercisable right now')
    return
  }
  const body = await res.json()
  expect(body.ready).toBe(false)
  expect(body.status).not.toBe('ready')
  expect(body.reason.length).toBeGreaterThan(0)
})
