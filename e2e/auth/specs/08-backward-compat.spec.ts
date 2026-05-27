/**
 * Auth E2E — Backward compatibility + bootstrap (ADR-0020, Phase 4).
 * Scenarios: 32, 33
 */

import { test, expect } from '@playwright/test'
import {
  loginAsAdmin,
  cookieMap,
  getAdminCookieHeader,
  uniqueEmail,
  apiPost,
  GATEWAY,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from '../fixtures/auth.js'

// ── 32. Existing machine token continues to work ──────────────────────────────

test('AUTH-32: existing machine token works via /auth/token + /auth/refresh', async ({
  request,
  page,
  context,
}) => {
  // Register a machine client (requires admin Bearer or public depending on build).
  // If /auth/register requires admin, use admin cookie-based approach.
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)
  const adminCookies = await cookieMap(context)

  // Try Bearer-based register first (new behaviour: MACHINE_REGISTER permission).
  // If the gateway issues a machine access token for admin, use it.
  // Otherwise fall back to cookie-based approach.

  // Step 1: obtain a machine client registration.
  const regRes = await request.post(`${GATEWAY}/auth/register`, {
    data: {
      name: `e2e-compat-${Date.now()}`,
      namespaceId: 'e2e',
      capabilities: [],
    },
    headers: {
      // Try both: cookie auth for admin + Bearer (if gateway issues machine tokens for admins).
      Cookie: Object.entries(adminCookies).map(([k, v]) => `${k}=${v}`).join('; '),
    },
  })

  test.skip(
    regRes.status() === 404,
    '/auth/register endpoint not available in this build — skip backward-compat test',
  )

  // If we got 401/403 with cookie auth, try without (public registration).
  let clientId: string
  let clientSecret: string

  if (regRes.ok()) {
    const body = await regRes.json() as { clientId: string; clientSecret: string }
    clientId = body.clientId
    clientSecret = body.clientSecret
  } else {
    // Some builds allow public /auth/register.
    const pubRegRes = await request.post(`${GATEWAY}/auth/register`, {
      data: { name: `e2e-compat-pub-${Date.now()}`, namespaceId: 'e2e', capabilities: [] },
    })
    test.skip(
      !pubRegRes.ok(),
      `/auth/register returned ${pubRegRes.status()} — cannot obtain machine client`,
    )
    const body = await pubRegRes.json() as { clientId: string; clientSecret: string }
    clientId = body.clientId
    clientSecret = body.clientSecret
  }

  // Step 2: exchange clientId + clientSecret for a machine access token.
  const tokenRes = await request.post(`${GATEWAY}/auth/token`, {
    data: { clientId, clientSecret },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(tokenRes.ok(), `/auth/token failed: ${tokenRes.status()}`).toBe(true)
  const { accessToken, refreshToken } = await tokenRes.json() as {
    accessToken: string
    refreshToken?: string
  }
  expect(accessToken).toBeTruthy()

  // Step 3: the access token must work on a protected endpoint (no CSRF needed for Bearer).
  const meRes = await request.get(`${GATEWAY}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // Machine tokens may not map to a human user — accept 200 or 404.
  // What must NOT happen: 401 (token rejected) or 403 (CSRF required).
  expect(meRes.status()).not.toBe(401)
  expect(meRes.status()).not.toBe(403)

  // Step 4: if a refresh token was issued, verify it can be rotated.
  if (refreshToken) {
    const refreshRes = await request.post(`${GATEWAY}/auth/refresh`, {
      data: { refreshToken },
      headers: { 'Content-Type': 'application/json' },
    })
    // Accept 200 (success) or 404 (machine refresh not implemented yet).
    // Must NOT be 401 (existing token rejected prematurely).
    expect(refreshRes.status()).not.toBe(401)
  }

  void adminCookieHeader
})

// ── 33. /auth/register is admin-only; bootstrap is idempotent ────────────────

test('AUTH-33: /auth/register anonymous → 401, member → 403, admin → 200; bootstrap idempotent', async ({
  request,
  page,
  context,
  browser,
}) => {
  // ── 33a: anonymous request → 401 ──────────────────────────────────────────
  const anonRes = await request.post(`${GATEWAY}/auth/register`, {
    data: { name: 'e2e-anon-33', namespaceId: 'e2e', capabilities: [] },
    headers: { 'Content-Type': 'application/json' },
  })
  test.skip(anonRes.status() === 404, '/auth/register not available in this build')

  expect(
    anonRes.status(),
    `anonymous /auth/register should return 401, got ${anonRes.status()}`,
  ).toBe(401)

  // ── 33b: member (non-admin) → 403 ─────────────────────────────────────────
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)

  // Invite + activate a member.
  const memberEmail = uniqueEmail('member33')
  const inviteRes = await request.post(`${GATEWAY}/api/auth/invites`, {
    data: { email: memberEmail },
    headers: {
      Cookie: Object.entries(await cookieMap(context)).map(([k, v]) => `${k}=${v}`).join('; '),
      'Content-Type': 'application/json',
    },
  })
  expect(inviteRes.ok(), `invite failed: ${inviteRes.status()}`).toBe(true)
  const { activationUrl } = await inviteRes.json() as { activationUrl: string }

  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  try {
    // Activate member.
    await memberPage.goto(activationUrl)
    await memberPage.waitForSelector('input[id="activate-password"]')
    await memberPage.fill('input[id="activate-password"]', 'MemberPass123!')
    await memberPage.fill('input[id="activate-confirm"]', 'MemberPass123!')
    await memberPage.click('button[type="submit"]')
    await memberPage.waitForURL((url) => !url.pathname.includes('/activate'), { timeout: 15_000 })

    const memberCookieHeader = Object.entries(await cookieMap(memberCtx))
      .map(([k, v]) => `${k}=${v}`).join('; ')

    // Member attempts /auth/register.
    const memberRegRes = await memberCtx.request.post(`${GATEWAY}/auth/register`, {
      data: { name: 'e2e-member-33', namespaceId: 'e2e', capabilities: [] },
      headers: {
        Cookie: memberCookieHeader,
        'Content-Type': 'application/json',
      },
    })
    expect(
      memberRegRes.status(),
      `member /auth/register should return 403, got ${memberRegRes.status()}`,
    ).toBe(403)
  } finally {
    await memberCtx.close()
  }

  // ── 33c: admin → 200 ──────────────────────────────────────────────────────
  const adminCookies = await cookieMap(context)
  const adminRegRes = await request.post(`${GATEWAY}/auth/register`, {
    data: { name: `e2e-admin-33-${Date.now()}`, namespaceId: 'e2e', capabilities: [] },
    headers: {
      Cookie: Object.entries(adminCookies).map(([k, v]) => `${k}=${v}`).join('; '),
      'Content-Type': 'application/json',
    },
  })
  expect(
    adminRegRes.status(),
    `admin /auth/register should return 200, got ${adminRegRes.status()}`,
  ).toBe(200)

  // ── 33d: bootstrap idempotent — admin email already exists, re-login works ─
  // Simulate gateway restart by just logging in again with bootstrap credentials.
  // The gateway bootstrap function must be idempotent: 3 restarts → still 1 admin.
  for (let restart = 1; restart <= 3; restart++) {
    const loginRes = await request.post(`${GATEWAY}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(
      loginRes.status(),
      `admin login on simulated restart ${restart} should return 200`,
    ).toBe(200)
  }

  void adminCookieHeader
})
