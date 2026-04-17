import { test, expect } from '@playwright/test'
import { GATEWAY, REST } from '../../fixtures/urls.js'

test('P-01: platform plugin registry contains expected plugins after boot', async ({ request }) => {
  // Tests plugin discovery via REST (no auth required).
  // Gateway auth + /hosts list tested separately in gateway/auth.spec.ts.
  const res = await request.get(`${REST}/api/v1/plugins/registry`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Response: { ok: true, data: { manifests: [{ pluginId, manifest: { id, name }, ... }] } }
  const manifests: { pluginId?: string; manifest?: { id?: string } }[] =
    body.data?.manifests ?? body.manifests ?? []
  // All KB Labs CLI plugins register with id @kb-labs/<name> — at least one must be present
  const hasKbPlugin = manifests.some(
    m => m.pluginId?.startsWith('@kb-labs') || m.manifest?.id?.startsWith('@kb-labs'),
  )
  expect(hasKbPlugin).toBe(true)
})

test('P-02: rest-api /api/v1/routes lists registered routes', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/routes`)
  expect(res.status()).toBe(200)
})

test('P-03: unknown gateway route returns 404 not 500', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/this-does-not-exist-e2e`)
  expect(res.status()).toBe(404)
})

test('P-04: plugin commands appear in kb --help', async () => { test.skip(true, 'not yet implemented') })
test('P-05: plugin manifest loads without errors', async () => { test.skip(true, 'not yet implemented') })
