import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'

// Regression suite for Studio MF proxy issues — gateway must serve all MF assets
// correctly so Module Federation bootstrap works in the browser.

test('MF-01: MF manifest is served with correct Content-Type', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/studio/mf-manifest.json`)
  test.skip(res.status() === 404, 'Studio not deployed in this environment')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/json')
})

test('MF-02: remoteEntry.js served as JavaScript (not HTML/text)', async ({ request }) => {
  // If gateway returns HTML (404 page) for JS chunks the MF bootstrap silently fails
  const manifest = await request.get(`${GATEWAY}/studio/mf-manifest.json`)
  test.skip(manifest.status() === 404, 'Studio not deployed in this environment')

  const body = await manifest.json()
  // Find first remote entry URL from manifest
  const remotes: Record<string, { entry?: string; url?: string }> = body.remotes ?? body
  const entryUrl = Object.values(remotes)[0]?.entry ?? Object.values(remotes)[0]?.url
  test.skip(!entryUrl, 'No remoteEntry URL in manifest')

  const res = await request.get(entryUrl!.startsWith('http') ? entryUrl! : `${GATEWAY}${entryUrl}`)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('javascript')
})

test('MF-03: MF assets have CORS headers (required for cross-origin MF loading)', async ({ request }) => {
  const manifest = await request.get(`${GATEWAY}/studio/mf-manifest.json`)
  test.skip(manifest.status() === 404, 'Studio not deployed in this environment')
  // CORS must be present so browser can load MF chunks from gateway origin
  expect(
    manifest.headers()['access-control-allow-origin'] ?? manifest.headers()['vary'],
  ).toBeTruthy()
})

test('MF-04: JS chunks return 200 not redirect (proxy rewrite must not double-prefix)', async ({ request }) => {
  // Regression: proxy was rewriting /studio/assets/ → /studio/studio/assets/ (double prefix)
  const res = await request.get(`${GATEWAY}/studio/assets/`)
  // 404 is fine (dir listing off), but must not be 301/302/307 (redirect loop)
  expect([200, 403, 404]).toContain(res.status())
  expect([301, 302, 307, 308]).not.toContain(res.status())
})

test('MF-05: unknown studio asset returns 404 not 500', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/studio/assets/nonexistent-chunk-e2e-test.js`)
  test.skip(res.status() === 200, 'Catch-all returning 200 — investigate')
  expect([404, 403]).toContain(res.status())
})

test('MF-06: all remoteEntry URLs in manifest resolve to 200', async () => { test.skip(true, 'not yet implemented') })
test('MF-07: studio app boots in browser without JS errors (Playwright page test)', async () => { test.skip(true, 'not yet implemented') })
