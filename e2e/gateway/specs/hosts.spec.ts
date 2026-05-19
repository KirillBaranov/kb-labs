import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { registerAgent, issueToken } from '@kb-labs/e2e-shared/auth.js'

async function registerHostForAgent(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  name: string,
): Promise<{ hostId: string; token: string }> {
  const creds = await registerAgent(request, `e2e-agent-${name}`)
  const namespaceId: string = (creds as Record<string, string>).namespaceId ?? 'e2e'
  const tokens = await issueToken(request, creds)

  const regRes = await request.post(`${GATEWAY}/hosts/register`, {
    data: { name, namespaceId, capabilities: [], workspacePaths: [] },
  })
  expect([200, 201]).toContain(regRes.status())
  const body = await regRes.json()
  const hostId: string = body.hostId ?? body.data?.hostId ?? body.id
  expect(hostId).toBeTruthy()
  return { hostId, token: tokens.accessToken }
}

test('GW-H-01: POST /hosts/register returns hostId and machineToken', async ({ request }) => {
  const creds = await registerAgent(request, 'e2e-agent-h01')
  const namespaceId: string = (creds as Record<string, string>).namespaceId ?? 'e2e'

  const res = await request.post(`${GATEWAY}/hosts/register`, {
    data: { name: 'e2e-host-reg', namespaceId, capabilities: [], workspacePaths: [] },
  })
  expect([200, 201]).toContain(res.status())
  const body = await res.json()
  const hostId: string = body.hostId ?? body.data?.hostId ?? body.id
  const machineToken: string = body.machineToken ?? body.data?.machineToken ?? body.token
  expect(hostId).toBeTruthy()
  expect(machineToken).toBeTruthy()
})

test('GW-H-02: GET /hosts with token returns array', async ({ request }) => {
  const creds = await registerAgent(request)
  const tokens = await issueToken(request, creds)
  const res = await request.get(`${GATEWAY}/hosts`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const list = body.data ?? body.hosts ?? body
  expect(Array.isArray(list)).toBe(true)
})

test('GW-H-03: GET /hosts/:hostId returns registered host detail', async ({ request }) => {
  const { hostId, token } = await registerHostForAgent(request, 'e2e-host-get')

  const res = await request.get(`${GATEWAY}/hosts/${encodeURIComponent(hostId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const id: string = body.hostId ?? body.data?.hostId ?? body.id
  expect(id).toBe(hostId)
})

test('GW-H-04: DELETE /hosts/:hostId removes the host', async ({ request }) => {
  const { hostId, token } = await registerHostForAgent(request, 'e2e-host-del')

  const delRes = await request.delete(`${GATEWAY}/hosts/${encodeURIComponent(hostId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect([200, 204]).toContain(delRes.status())
})

test('GW-H-05: GET /hosts without token returns 401', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`)
  expect([401, 403]).toContain(res.status())
})
