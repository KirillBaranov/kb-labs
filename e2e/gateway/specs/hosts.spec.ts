import { test, expect } from '@playwright/test'
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'

test('GW-H-01: POST /hosts/register returns hostId and machineToken', async ({ request }) => {
  const res = await request.post(`${GATEWAY}/hosts/register`, {
    data: { name: 'e2e-host-reg', namespaceId: 'e2e' },
  })
  expect([200, 201]).toContain(res.status())
  const body = await res.json()
  const hostId: string = body.hostId ?? body.data?.hostId ?? body.id
  const token: string = body.machineToken ?? body.data?.machineToken ?? body.token
  expect(hostId).toBeTruthy()
  expect(token).toBeTruthy()
})

test('GW-H-02: GET /hosts with token returns array', async ({ request }) => {
  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/hosts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const list = body.data ?? body.hosts ?? body
  expect(Array.isArray(list)).toBe(true)
})

test('GW-H-03: GET /hosts/:hostId returns registered host detail', async ({ request }) => {
  // Register a host first
  const regRes = await request.post(`${GATEWAY}/hosts/register`, {
    data: { name: 'e2e-host-get', namespaceId: 'e2e' },
  })
  expect([200, 201]).toContain(regRes.status())
  const regBody = await regRes.json()
  const hostId: string = regBody.hostId ?? regBody.data?.hostId ?? regBody.id
  expect(hostId).toBeTruthy()

  const token = await getAccessToken(request)
  const res = await request.get(`${GATEWAY}/hosts/${encodeURIComponent(hostId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const id: string = body.hostId ?? body.data?.hostId ?? body.id
  expect(id).toBe(hostId)
})

test('GW-H-04: DELETE /hosts/:hostId removes the host', async ({ request }) => {
  const regRes = await request.post(`${GATEWAY}/hosts/register`, {
    data: { name: 'e2e-host-del', namespaceId: 'e2e' },
  })
  const regBody = await regRes.json()
  const hostId: string = regBody.hostId ?? regBody.data?.hostId ?? regBody.id
  expect(hostId).toBeTruthy()

  const token = await getAccessToken(request)
  const delRes = await request.delete(`${GATEWAY}/hosts/${encodeURIComponent(hostId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect([200, 204]).toContain(delRes.status())
})

test('GW-H-05: GET /hosts without token returns 401', async ({ request }) => {
  const res = await request.get(`${GATEWAY}/hosts`)
  expect([401, 403]).toContain(res.status())
})
