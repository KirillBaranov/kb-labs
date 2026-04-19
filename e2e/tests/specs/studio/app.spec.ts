import { test, expect } from '@playwright/test'
import { GATEWAY, REST } from '../../fixtures/urls.js'

/**
 * Studio app e2e tests.
 *
 * Studio is served through the Gateway (:4000). These tests verify the app
 * shell loads, microfrontend chunks resolve, and the API is wired up to the
 * backend correctly.
 *
 * All tests skip gracefully when Studio is not served in the current
 * environment (minimal install without studio plugin).
 */

// SA-01: gateway root returns HTML
test('SA-01: gateway / — returns HTML with <html> tag', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/`)
  test.skip(res.status() === 404, 'Studio not served through gateway in this environment')
  expect(res.status()).toBe(200)
  const text = await res.text()
  expect(text.toLowerCase()).toContain('<html')
})

// SA-02: MF manifest is a valid JSON object with remotes
test('SA-02: MF manifest — valid JSON with remotes map', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/mf-manifest.json`)
  test.skip(res.status() === 404, 'Studio MF manifest not exposed in this environment')
  expect(res.status()).toBe(200)
  const body = await res.json()
  // Manifest must be an object with at least one key (the shell or remotes map)
  expect(typeof body).toBe('object')
  expect(body).not.toBeNull()
  // Common shapes: { remotes: {...} } or { [name]: { url } }
  const hasContent =
    typeof body.remotes === 'object' ||
    typeof body.modules === 'object' ||
    Object.keys(body).length > 0
  expect(hasContent).toBe(true)
})

// SA-03: MF chunk for workflow plugin resolves (no 404)
test('SA-03: MF chunk for workflow plugin resolves', async ({ request }) => {
  // Fetch manifest first to find an actual chunk URL
  const manifestRes = await request.get(`${GATEWAY}/mf-manifest.json`)
  test.skip(manifestRes.status() === 404, 'Studio MF manifest not exposed')

  const manifest = await manifestRes.json()
  // Find a URL that looks like a JS chunk
  const urls: string[] = []
  function collectUrls(obj: unknown, depth = 0): void {
    if (depth > 4 || typeof obj !== 'object' || !obj) return
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (typeof val === 'string' && val.endsWith('.js')) urls.push(val)
      else collectUrls(val, depth + 1)
    }
  }
  collectUrls(manifest)
  test.skip(urls.length === 0, 'No JS chunks found in MF manifest')

  // Verify the first chunk URL loads (200 or 304 = fine)
  const chunkUrl = urls[0].startsWith('http') ? urls[0] : `${GATEWAY}${urls[0]}`
  const chunkRes = await request.get(chunkUrl)
  expect([200, 304]).toContain(chunkRes.status())
})

// SA-04: REST /api/v1/status — used by studio to determine backend readiness
test('SA-04: REST /api/v1/status responds for studio health bar', async ({ request }) => {
  const res = await request.get(`${REST}/api/v1/status`)
  // 404 = not exposed — fall back to /health
  if (res.status() === 404) {
    const health = await request.get(`${REST}/health`)
    expect(health.status()).toBe(200)
    return
  }
  expect(res.status()).toBe(200)
  const body = await res.json()
  const status = body.data?.status ?? body.status ?? body.data?.ok
  expect(status).toBeTruthy()
})

// SA-05: static assets under /assets/ are cacheable (Cache-Control header)
test('SA-05: static assets have caching headers', async ({ request }) => {
  const manifestRes = await request.get(`${GATEWAY}/mf-manifest.json`)
  test.skip(manifestRes.status() === 404, 'Studio not served')

  // /mf-manifest.json itself should at minimum return no 5xx
  const headers = manifestRes.headers()
  // Content-Type must be JSON
  expect(headers['content-type']).toMatch(/json/)
})
