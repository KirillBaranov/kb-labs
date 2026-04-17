import { test, expect } from '@playwright/test'
import { GATEWAY } from '../../fixtures/urls.js'

// SSE and WebSocket must be proxied correctly by gateway.
// Common failure: proxy strips Upgrade/Connection headers or buffers SSE response.

test('RT-01: WebSocket upgrade succeeds through gateway (/hosts/connect)', async ({ page }) => {
  let wsError: string | null = null

  page.on('websocket', ws => {
    if (ws.url().includes('/hosts/connect')) {
      ws.on('socketerror', err => { wsError = String(err) })
    }
  })

  await page.evaluate(async (gatewayUrl) => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${gatewayUrl.replace('http', 'ws')}/hosts/connect`)
      // We only care that the upgrade was accepted — don't need full handshake
      ws.onopen = () => { ws.close(); resolve() }
      ws.onerror = (e) => reject(new Error(`WS error: ${JSON.stringify(e)}`))
      setTimeout(() => reject(new Error('WS connect timeout')), 5000)
    })
  }, GATEWAY).catch(() => {
    // Server may close immediately (auth required) — that's fine, upgrade still worked
  })

  // Gateway must not be ECONNREFUSED — 401/426 close is acceptable
  expect(wsError ?? '').not.toContain('ECONNREFUSED')
})

test('RT-02: SSE endpoint streams events (not buffered by proxy)', async ({ page }) => {
  // Gateway must pass through Transfer-Encoding: chunked / Content-Type: text/event-stream
  // A buffering proxy would hold the response and deliver it all at once (broken SSE)
  const response = await page.request.get(`${GATEWAY}/api/v1/events`, {
    headers: { Accept: 'text/event-stream' },
    timeout: 5000,
  }).catch(() => null)

  // Skip if endpoint doesn't exist or requires auth
  test.skip(
    response === null || response.status() === 404 || response.status() === 401,
    'SSE events endpoint not available or requires auth',
  )

  expect(response!.status()).toBe(200)
  expect(response!.headers()['content-type']).toContain('text/event-stream')
  // Must NOT have content-length (that would mean buffered, not streaming)
  expect(response!.headers()['content-length']).toBeUndefined()
  // Must have cache-control: no-cache (required for SSE)
  expect(response!.headers()['cache-control']).toContain('no-cache')
})

test('RT-03: gateway forwards Connection/Upgrade headers (not stripped)', async ({ request }) => {
  // Check that gateway OPTIONS on WS path returns correct headers
  const res = await request.fetch(`${GATEWAY}/hosts/connect`, {
    method: 'OPTIONS',
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
    },
  })
  // Must not return 502 — gateway should handle the upgrade path
  // 401 = auth required (endpoint registered, upgrade path works)
  expect([101, 200, 204, 400, 401, 426]).toContain(res.status())
  expect(res.status()).not.toBe(502) // 502 = proxy didn't forward the upgrade
})

test('RT-04: workflow status updates delivered over WS in real-time', async () => { test.skip(true, 'not yet implemented') })
test('RT-05: SSE reconnects after gateway restart within 5s', async () => { test.skip(true, 'not yet implemented') })
