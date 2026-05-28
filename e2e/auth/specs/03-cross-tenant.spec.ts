/**
 * Auth E2E — Cross-tenant isolation (ADR-0020, Phase 4).
 * Scenarios: 10, 11
 *
 * NOTE: These tests are relevant in multi-tenant deployments where each
 * tenant has its own subdomain ({tenant}.kblabs.ru). In a local single-tenant
 * setup they verify the gateway rejects mismatched tenantId in the JWT.
 */

import { test, expect } from '@playwright/test'
import {
  loginAsAdmin,
  cookieMap,
  apiGet,
  GATEWAY,
  TENANT_ID,
} from '../fixtures/auth.js'

// ── 10. Cross-tenant guard: cookie from tenant A + Host header tenant B → 401 ─

test('AUTH-10: cross-tenant guard — access token for tenant A rejected on tenant B endpoint', async ({
  request,
  page,
  context,
}) => {
  // Log in to get a valid cookie for TENANT_ID.
  await loginAsAdmin(page)
  const cookies = await cookieMap(context)
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')

  // Call /api/auth/me with a spoofed Host header for a different tenant.
  // The gateway's tenant-resolver reads tenantId from the JWT and compares
  // it to the Host header; mismatch → 401.
  const fakeTenant = `other-tenant-${Date.now()}`
  const res = await request.get(`${GATEWAY}/api/auth/me`, {
    headers: {
      Cookie: cookieHeader,
      Host: `${fakeTenant}.kblabs.ru`,
    },
  })

  // Must be rejected — either 401 (wrong tenant) or 404 (unknown tenant).
  // Both are acceptable; what is NOT acceptable is 200.
  expect([401, 403, 404]).toContain(res.status())

  void TENANT_ID
})

// ── 11. Cookie isolation between subdomains ────────────────────────────────────

test('AUTH-11: cookie isolation — cookies are origin-scoped, no Domain= attribute', async ({
  page,
  context,
}) => {
  await loginAsAdmin(page)
  const cookies = await context.cookies()

  // None of the auth cookies should have an explicit Domain attribute.
  // With no Domain= the cookie is scoped to the exact origin (subdomain) only.
  for (const cookie of cookies.filter((c) => ['kb_access', 'kb_refresh', 'kb_csrf'].includes(c.name))) {
    // Playwright fills domain with the request hostname (e.g. "localhost") when the
    // server does not send an explicit Domain= attribute. A leading dot would only
    // appear if the server sent Domain= for a wildcard-subdomain cookie — verify none.
    expect(
      cookie.domain,
      `Cookie ${cookie.name} has wildcard Domain=${cookie.domain} — must be origin-scoped (no Domain=)`,
    ).not.toMatch(/^\./)
  }
})
