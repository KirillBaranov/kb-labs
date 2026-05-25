import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'

test('ST-01: gateway serves studio app', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/`)
  test.skip(res.status() === 404, 'Studio not served in this environment')
  expect(res.status()).toBe(200)
})

test('ST-02: gateway serves MF manifest JSON', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/mf-manifest.json`)
  test.skip(res.status() === 404, 'Studio MF not enabled in this environment')
  expect(res.status()).toBe(200)
})

test('ST-03: all MF chunks load without 404', async () => { test.skip(true, 'not yet implemented') })
test('ST-04: studio app renders without JS console errors', async () => { test.skip(true, 'not yet implemented') })
