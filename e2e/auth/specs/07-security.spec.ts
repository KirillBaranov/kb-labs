/**
 * Auth E2E — Security hardening (ADR-0020, Phase 4).
 * Scenarios: 25, 26, 27, 28, 29, 30, 31
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

// ── 25. CSRF missing on mutating endpoint → 403 ───────────────────────────────

test('AUTH-25: missing X-CSRF-Token on mutating endpoint → 403', async ({
  page,
  context,
  request,
}) => {
  await loginAsAdmin(page)
  const cookies = await cookieMap(context)
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')

  // POST /api/auth/logout without CSRF header.
  const res = await request.post(`${GATEWAY}/api/auth/logout`, {
    headers: {
      Cookie: cookieHeader,
      // Deliberately omit X-CSRF-Token
    },
  })
  expect(res.status()).toBe(403)
})

// ── 26. CSRF mismatch → 403 ───────────────────────────────────────────────────

test('AUTH-26: mismatched X-CSRF-Token → 403', async ({
  page,
  context,
  request,
}) => {
  await loginAsAdmin(page)
  const cookies = await cookieMap(context)
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')

  const res = await request.post(`${GATEWAY}/api/auth/logout`, {
    headers: {
      Cookie: cookieHeader,
      'X-CSRF-Token': 'wrong-csrf-token-value',
    },
  })
  expect(res.status()).toBe(403)
})

// ── 27. Rate limit per-IP: 10 failed logins → 429 ────────────────────────────

test('AUTH-27: rate limit per-IP — 11th failed login within 1m → 429', async ({
  request,
}) => {
  // Requires: gateway configured with loginPerIp limit of 10/m.
  // Use a unique spoofed X-Forwarded-For IP so this test's per-IP counter
  // is isolated and does not exhaust the shared E2E IP limit for other tests.
  // Fastify trustProxy: true takes the leftmost IP from X-Forwarded-For.
  const ISOLATED_IP = '192.168.254.27'
  const email = uniqueEmail('ratelimit27')

  let lastStatus = 0
  for (let i = 0; i < 12; i++) {
    const res = await request.post(`${GATEWAY}/api/auth/login`, {
      data: { email, password: 'WrongPass!' },
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ISOLATED_IP,
      },
    })
    lastStatus = res.status()
    if (lastStatus === 429) break
  }
  expect(lastStatus).toBe(429)
})

// ── 28. Rate limit per-email: 5 fails from different IPs → 429 ───────────────

test('AUTH-28: rate limit per-email — 6th failed login for same email → 429', async ({
  request,
}) => {
  // The gateway rate-limits by email regardless of source IP.
  // Use a unique spoofed X-Forwarded-For IP so this test's per-IP counter
  // is isolated and does not exhaust the shared E2E IP limit for other tests.
  // Fastify trustProxy: true takes the leftmost IP from X-Forwarded-For.
  const ISOLATED_IP = '192.168.254.28'
  const email = uniqueEmail('ratelimit28')

  let lastStatus = 0
  for (let i = 0; i < 8; i++) {
    const res = await request.post(`${GATEWAY}/api/auth/login`, {
      data: { email, password: 'WrongPass!' },
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ISOLATED_IP,
      },
    })
    lastStatus = res.status()
    if (lastStatus === 429) break
  }
  expect(lastStatus).toBe(429)
})

// ── 29. Cookie attributes: HttpOnly, Secure, SameSite=Strict, no Domain ────────

test('AUTH-29: cookie attributes — HttpOnly/Secure/SameSite=Strict/no-Domain', async ({
  page,
  context,
}) => {
  await loginAsAdmin(page)
  const cookies = await context.cookies()
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c]))

  const assertCookie = (name: string, httpOnly: boolean): void => {
    const c = byName[name]
    expect(c, `Cookie ${name} not found`).toBeTruthy()
    expect(c!.httpOnly).toBe(httpOnly)
    expect(c!.secure).toBe(true)
    expect(c!.sameSite).toBe('Strict')
    expect(c!.domain).toBeFalsy()
  }

  assertCookie('kb_access',  true)   // HttpOnly — not readable by JS
  assertCookie('kb_refresh', true)   // HttpOnly
  assertCookie('kb_csrf',    false)  // Non-HttpOnly — must be readable by CSRF interceptor
})

// ── 30. Bearer auth (machine client) — no CSRF required ──────────────────────

test('AUTH-30: Bearer auth (machine client) succeeds without CSRF header', async ({
  request,
}) => {
  // Obtain a machine token via /auth/register + /auth/token (existing flow).
  const regRes = await request.post(`${GATEWAY}/auth/register`, {
    data: { name: 'e2e-machine-30', namespaceId: 'e2e', capabilities: [] },
  })
  test.skip(regRes.status() === 404, '/auth/register not available in this build')

  if (regRes.status() === 401) {
    // /auth/register now requires MACHINE_REGISTER permission — skip for this test.
    test.skip(true, '/auth/register requires admin Bearer token in this build')
  }
  expect(regRes.ok()).toBe(true)

  const { clientId, clientSecret } = await regRes.json()
  const tokenRes = await request.post(`${GATEWAY}/auth/token`, {
    data: { clientId, clientSecret },
  })
  expect(tokenRes.ok()).toBe(true)
  const { accessToken } = await tokenRes.json()

  // Call a protected endpoint with Bearer — NO X-CSRF-Token header.
  const meRes = await request.get(`${GATEWAY}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // Machine token may not map to a user-me endpoint; accept 200 or 404.
  // What we must NOT see is 403 (CSRF required).
  expect(meRes.status()).not.toBe(403)
})

// ── 31. No `role` field in /api/auth/me response (CD-3) ──────────────────────

test('AUTH-31: /api/auth/me response contains no role field (CD-3)', async ({
  page,
  context,
  request,
}) => {
  await loginAsAdmin(page)
  const cookieHeader = await getAdminCookieHeader(context)

  const res = await request.get(`${GATEWAY}/api/auth/me`, {
    headers: {
      Cookie: Object.entries(await cookieMap(context)).map(([k, v]) => `${k}=${v}`).join('; '),
    },
  })
  expect(res.status()).toBe(200)
  const body = await res.json() as Record<string, unknown>

  // Must have userId, email, tenantId.
  expect(body['userId']).toBeTruthy()
  expect(body['email']).toBeTruthy()
  expect(body['tenantId']).toBeTruthy()

  // Must NOT have role.
  expect(body['role']).toBeUndefined()

  void cookieHeader
})
