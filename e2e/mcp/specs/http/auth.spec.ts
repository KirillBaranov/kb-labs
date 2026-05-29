import { test, expect } from '@playwright/test'
import { getAccessToken } from '@kb-labs/e2e-shared/auth.js'
import { listTools } from './_helpers.js'

// MCP authentication behavior. The daemon validates the Bearer token itself
// (shared GATEWAY_JWT_SECRET). Invalid/absent tokens fall back to anonymous —
// an empty catalog, never a 401 — so MCP clients degrade gracefully.
//
// Granular per-operation visibility (read vs write hiding) is enforced by the
// PDP and covered by unit tests on filterTools/authz. Today the PDP is permit-all,
// so any valid identity sees the full catalog; these specs assert the
// authenticated-vs-anonymous boundary, which is the live, observable contract.

test('A-01: no token → empty catalog (no 401)', async ({ request }) => {
  const tools = await listTools(request)
  expect(tools).toHaveLength(0)
})

test('A-02: invalid token → anonymous fallback (empty catalog, no 401)', async ({ request }) => {
  const tools = await listTools(request, 'not-a-real-jwt')
  expect(tools).toHaveLength(0)
})

test('A-03: valid token → non-empty catalog', async ({ request }) => {
  const token = await getAccessToken(request)
  const tools = await listTools(request, token)
  expect(tools.length).toBeGreaterThan(0)
})
