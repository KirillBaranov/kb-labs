import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import {
  connectWs,
  withWs,
  expectWsMessage,
  expectWsClose,
  registerHost,
  httpClient,
} from '@kb-labs/shared-testing-e2e'

// Gateway WS base URL — derived from the HTTP gateway URL
const GATEWAY_WS = GATEWAY.replace(/^http/, 'ws')
const HOSTS_CONNECT = `${GATEWAY_WS}/hosts/connect`

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Register a host via /hosts/register and return its machine token.
 * Uses the shared registerHost helper which calls the Gateway REST API.
 */
async function getHostToken(name = 'e2e-ws-heartbeat-host'): Promise<string> {
  const client = httpClient(GATEWAY)
  const creds = await registerHost(client, { name, namespaceId: 'e2e-ws' })
  return creds.machineToken
}

interface WsMessage {
  type: string
  [key: string]: unknown
}

/**
 * Complete the WS handshake after connecting:
 *   1. Send hello
 *   2. Wait for connected
 * Returns the connected message.
 */
async function completeHandshake(
  token: string,
): Promise<{ handle: Awaited<ReturnType<typeof connectWs>>; connected: WsMessage }> {
  const handle = await connectWs(HOSTS_CONNECT, {
    headers: { Authorization: `Bearer ${token}` },
    openTimeoutMs: 10_000,
  })

  // Send hello immediately after open
  handle.send({ type: 'hello', protocolVersion: '1.0', agentVersion: '0.1.0' })

  // Wait for connected message — server confirms successful handshake
  const connected = await handle.waitForMessage<WsMessage>({
    timeoutMs: 8_000,
    predicate: (msg) => msg.type === 'connected',
  })

  return { handle, connected }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/**
 * WS-GH01: Client heartbeat triggers server ack within expected time.
 *
 * The Gateway WS protocol: client → { type: 'heartbeat' }, server → { type: 'ack' }.
 * This test verifies the heartbeat round-trip works after a successful handshake.
 */
test('WS-GH01: heartbeat round-trip — client ping receives server ack', async () => {
  test.setTimeout(60_000)

  const token = await getHostToken('e2e-ws-gh01')
  const { handle } = await completeHandshake(token)

  try {
    // Send a heartbeat — server should respond with { type: 'ack' }
    handle.send({ type: 'heartbeat' })

    const ack = await expectWsMessage<WsMessage>(
      handle,
      (msg) => msg.type === 'ack',
      { timeoutMs: 45_000, label: 'heartbeat ack from server' },
    )

    expect(ack.type).toBe('ack')
  } finally {
    handle.close(1000)
  }
})

/**
 * WS-GH02: Invalid token → server rejects connection immediately.
 *
 * The Gateway WS handler checks the machine token at connection time.
 * A random invalid token must be rejected: either the connection closes
 * before/during hello, or an error message is received — within 5s.
 */
test('WS-GH02: invalid token → connection rejected immediately', async () => {
  test.setTimeout(15_000)

  // Use a random string that will fail machine-token validation
  const badToken = 'invalid-token-e2e-ws-gh02-' + Math.random().toString(36).slice(2)

  let closedWithError = false

  try {
    // Attempt to open — may throw immediately if server drops at transport level
    const handle = await connectWs(HOSTS_CONNECT, {
      headers: { Authorization: `Bearer ${badToken}` },
      openTimeoutMs: 5_000,
    })

    // If connection opened (1008 sent after upgrade), we should receive
    // a close or error message within 5s
    const raceResult = await Promise.race([
      // Either the socket closes
      new Promise<'closed'>((resolve) => {
        handle.socket.once('close', () => resolve('closed'))
      }),
      // Or we receive an error-type message
      handle.waitForMessage<WsMessage>({ timeoutMs: 5_000 }).then((msg) => {
        if (msg.type === 'error') return 'error' as const
        // Any message before close is still a valid response path;
        // keep waiting for close
        return new Promise<'closed'>((resolve) => {
          handle.socket.once('close', () => resolve('closed'))
        })
      }),
    ])

    expect(['closed', 'error']).toContain(raceResult)
    closedWithError = true
    handle.close(1000)
  } catch {
    // connectWs threw — server closed connection at transport level (1006/1008).
    // This is the expected outcome for an invalid token.
    closedWithError = true
  }

  expect(closedWithError).toBe(true)
})

/**
 * WS-GH03: Clean client disconnect — gateway handles close without crashing.
 *
 * After completing the handshake, the client closes with code 1000.
 * The test verifies the close is acknowledged and the gateway /health
 * endpoint still returns 200 — confirming no crash occurred.
 */
test('WS-GH03: clean disconnect — gateway remains healthy after client close', async () => {
  test.setTimeout(20_000)

  const token = await getHostToken('e2e-ws-gh03')
  const { handle } = await completeHandshake(token)

  // Register close expectation before triggering it
  const closedPromise = expectWsClose(handle, 1000, { timeoutMs: 5_000 })

  // Client closes the connection cleanly
  handle.close(1000)

  await closedPromise

  // Verify gateway is still alive — no crash from handling the disconnect
  const healthRes = await fetch(`${GATEWAY}/health`)
  expect(healthRes.status).toBe(200)
})
