/**
 * Auth E2E — Admin flows (ADR-0020, Phase 4).
 * Scenarios: 17, 18, 19
 */

import { test, expect } from '@playwright/test'
import {
  loginAsAdmin,
  cookieMap,
  inviteUser,
  activateUser,
  getAdminCookieHeader,
  uniqueEmail,
  apiPost,
  apiGet,
  GATEWAY,
} from '../fixtures/auth.js'

// ── 17. Disable user mid-session (CD-1): next request before expiry → 401 ─────

test('AUTH-17: disable user mid-session → next request returns 401 (CD-1)', async ({
  page,
  context,
  request,
  browser,
}) => {
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)

  // Create member.
  const memberEmail = uniqueEmail('disable17')
  const activationUrl = await inviteUser(request, memberEmail, adminCookieHeader)
  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  try {
    await activateUser(memberPage, activationUrl, 'MemberPass123!')
    const memberCookies = await cookieMap(memberCtx)
    const memberCookieHeader = Object.entries(memberCookies)
      .map(([k, v]) => `${k}=${v}`).join('; ')

    // Confirm member can reach /api/auth/me.
    const meBefore = await apiGet(request, '/api/auth/me', memberCookieHeader)
    expect(meBefore.status).toBe(200)
    const userId = (meBefore.body as { userId: string }).userId

    // Admin disables the member (while their session is still valid).
    const disableRes = await apiPost(request, `/api/auth/users/${userId}/disable`, adminCookieHeader)
    expect(disableRes.status).toBe(200)

    // CD-1: the very next request from the member must fail — before access TTL expires.
    // The gateway middleware checks user.status on every request (LRU cache + invalidation).
    const meAfter = await apiGet(request, '/api/auth/me', memberCookieHeader)
    expect(meAfter.status).toBe(401)
  } finally {
    await memberCtx.close()
  }
})

// ── 18. Re-enable disabled user → fresh login works ──────────────────────────

test('AUTH-18: enable disabled user → fresh login works', async ({
  page,
  context,
  request,
  browser,
}) => {
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)

  const memberEmail = uniqueEmail('enable18')
  const activationUrl = await inviteUser(request, memberEmail, adminCookieHeader)

  // Create member and immediately disable.
  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  await activateUser(memberPage, activationUrl, 'MemberPass123!')
  const memberCookies = await cookieMap(memberCtx)
  const userId = ((await apiGet(
    request,
    '/api/auth/me',
    Object.entries(memberCookies).map(([k, v]) => `${k}=${v}`).join('; '),
  )).body as { userId: string }).userId
  await memberCtx.close()

  await apiPost(request, `/api/auth/users/${userId}/disable`, adminCookieHeader)

  // Confirm login is blocked.
  const loginRes = await request.post(`${GATEWAY}/api/auth/login`, {
    data: { email: memberEmail, password: 'MemberPass123!' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(loginRes.status()).toBe(401)

  // Admin re-enables.
  const enableRes = await apiPost(request, `/api/auth/users/${userId}/enable`, adminCookieHeader)
  expect(enableRes.status).toBe(200)

  // Fresh login should now work.
  const loginRes2 = await request.post(`${GATEWAY}/api/auth/login`, {
    data: { email: memberEmail, password: 'MemberPass123!' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(loginRes2.status()).toBe(200)
})

// ── 19. Member cannot POST /api/auth/invites → 403 ───────────────────────────

test('AUTH-19: member cannot create invites → 403 Forbidden', async ({
  page,
  context,
  request,
  browser,
}) => {
  await loginAsAdmin(page)
  const adminCookieHeader = await getAdminCookieHeader(context)

  const memberEmail = uniqueEmail('member19')
  const activationUrl = await inviteUser(request, memberEmail, adminCookieHeader)

  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  try {
    await activateUser(memberPage, activationUrl, 'MemberPass123!')
    const memberCookies = await cookieMap(memberCtx)
    const memberCookieHeader = Object.entries(memberCookies)
      .map(([k, v]) => `${k}=${v}`).join('; ')

    // Member tries to invite someone.
    const res = await apiPost(
      request,
      '/api/auth/invites',
      memberCookieHeader,
      { email: uniqueEmail('forbidden') },
    )
    expect(res.status).toBe(403)
  } finally {
    await memberCtx.close()
  }
})
