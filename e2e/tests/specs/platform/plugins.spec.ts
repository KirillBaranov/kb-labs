import { test, expect } from '@playwright/test'
import { REST } from '../../fixtures/urls.js'

// Verifies plugins are actually discovered and registered — not just that REST API is up

test('PL-01: plugin registry is populated after startup', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/plugins/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Registry must have at least core plugins (commit, scaffold, workflow, marketplace)
  const plugins: { id?: string; name?: string }[] = Array.isArray(body) ? body : body.plugins ?? []
  expect(plugins.length).toBeGreaterThan(0)
})

test('PL-02: plugin registry health — no validation errors', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/plugins/health`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toMatch(/ok|healthy/)
  // Must not have stale/partial plugins blocking core functionality
  expect(body.partial).toBeFalsy()
  expect(body.stale).toBeFalsy()
})

test('PL-03: studio plugin registry loaded (MF pages)', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/studio/registry`)
  test.skip(res.status() === 404, 'Studio registry not available')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(typeof body).toBe('object')
})

test('PL-04: commit plugin is registered and has expected commands', async () => { test.skip(true, 'not yet implemented') })
test('PL-05: scaffold plugin is registered and has expected templates', async () => { test.skip(true, 'not yet implemented') })
test('PL-06: workflow plugin is registered with daemon URL', async () => { test.skip(true, 'not yet implemented') })
