/**
 * Auth E2E — Machine-client registration authorization (ADR-0020, Phase 4).
 * Scenario: 33
 *
 * /auth/register provisions machine-client credentials and is gated by the
 * MACHINE_REGISTER permission: anonymous callers are rejected (401), an
 * authenticated member without the permission is forbidden (403), and an admin
 * (who holds it) succeeds (200).
 */

import { test, expect } from '@playwright/test'
import {
  loginAsAdmin,
  getAdminCookieHeader,
  createMember,
  apiPost,
  GATEWAY,
} from '../fixtures/auth.js'

test('AUTH-33: /auth/register admin-only — anon 401, member 403, admin 200', async ({
  page,
  context,
  browser,
  request,
}) => {
  // Anonymous (no session, no Bearer) → 401.
  const anon = await request.post(`${GATEWAY}/api/auth/register`, {
    data: { name: 'e2e-anon-33', capabilities: [] },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(anon.status()).toBe(401)

  // Admin holds MACHINE_REGISTER → 200 with issued client credentials.
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)
  const adminReg = await apiPost(request, '/api/auth/register', adminCookieHeader, {
    name: 'e2e-admin-33',
    capabilities: [],
  })
  expect(adminReg.status).toBe(200)
  expect((adminReg.body as { clientId?: string }).clientId).toBeTruthy()

  // A member without MACHINE_REGISTER → 403.
  const { memberCookieHeader, memberCtx } = await createMember(browser, context, request, {
    emailPrefix: 'register33',
  })
  try {
    const memberReg = await apiPost(request, '/api/auth/register', memberCookieHeader, {
      name: 'e2e-member-33',
      capabilities: [],
    })
    expect(memberReg.status).toBe(403)
  } finally {
    await memberCtx.close()
  }
})
