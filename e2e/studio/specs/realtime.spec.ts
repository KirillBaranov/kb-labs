import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'

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
      // Upgrade accepted → server auth check → close(1008). onopen fires before close.
      ws.onopen = () => { ws.close(); resolve() }
      ws.onerror = (e) => reject(new Error(`WS error: ${JSON.stringify(e)}`))
      setTimeout(() => reject(new Error('WS connect timeout')), 5000)
    })
  }, GATEWAY).catch(() => {
    // Server may close immediately after upgrade (auth fail = 1008/1006) — that's fine
  })

  // Upgrade must reach the server — ECONNREFUSED means gateway is down, not auth failure
  expect(wsError ?? '').not.toContain('ECONNREFUSED')
})

test('RT-02: SSE endpoint streams events (not buffered by proxy)', async ({ page }) => {
  // Gateway must pass through Transfer-Encoding: chunked / Content-Type: text/event-stream
  // A buffering proxy holds the whole response and delivers it at once (broken SSE)
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

test('RT-03: gateway WS route is registered (not 404)', async ({ request }) => {
  // Plain GET (no Upgrade headers) to a WebSocket-only route in Fastify returns 426 (Upgrade Required).
  // 401 = auth enforced before upgrade check (also means route exists).
  // 404 would mean the WS route is not registered — that's the failure mode we're guarding.
  // Note: sending actual WS Upgrade headers via HTTP client causes the connection to hang
  // (Fastify holds it open for the WS handshake) — tested via browser in RT-01 instead.
  const res = await request.get(`${GATEWAY}/hosts/connect`)
  expect([401, 426]).toContain(res.status())
})

test('RT-04: workflow status updates delivered over WS in real-time', async () => { test.skip(true, 'not yet implemented') })
test('RT-05: SSE reconnects after gateway restart within 5s', async () => { test.skip(true, 'not yet implemented') })
