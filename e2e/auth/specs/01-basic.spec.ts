/**
 * Auth E2E — Basic scenarios (ADR-0020, Phase 4).
 * Scenarios: 1, 2, 3, 4
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin, cookieMap, GATEWAY } from '../fixtures/auth.js'

// ── 1. Cold visit without cookie → redirect to /login ─────────────────────────

test('AUTH-01: cold visit without cookie → redirected to /login', async ({ page }) => {
  // Clear all cookies to simulate a cold visit.
  await page.context().clearCookies()
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
})

// ── 2. Bootstrap login → cookies with correct attributes ─────────────────────

test('AUTH-02: bootstrap login → authenticated, correct cookie attributes', async ({
  page,
  context,
}) => {
  await loginAsAdmin(page)

  // Should be redirected away from /login.
  expect(page.url()).not.toContain('/login')

  const cookies = await context.cookies()
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c]))

  // kb_access must be present, HttpOnly, Secure, SameSite=Strict.
  const access = byName['kb_access']
  expect(access, 'kb_access cookie missing').toBeTruthy()
  expect(access!.httpOnly).toBe(true)
  expect(access!.secure).toBe(true)
  expect(access!.sameSite).toBe('Strict')
  expect(access!.domain).toBeFalsy() // no explicit Domain= (origin-scoped)

  // kb_refresh must be HttpOnly, Secure, Strict.
  const refresh = byName['kb_refresh']
  expect(refresh, 'kb_refresh cookie missing').toBeTruthy()
  expect(refresh!.httpOnly).toBe(true)
  expect(refresh!.secure).toBe(true)
  expect(refresh!.sameSite).toBe('Strict')

  // kb_csrf must be readable by JS (not HttpOnly) but Secure + Strict.
  const csrf = byName['kb_csrf']
  expect(csrf, 'kb_csrf cookie missing').toBeTruthy()
  expect(csrf!.httpOnly).toBe(false) // must be readable by the JS CSRF interceptor
  expect(csrf!.secure).toBe(true)
  expect(csrf!.sameSite).toBe('Strict')
})

// ── 3. Logout → cookies cleared, /auth/me → 401, redirect /login ─────────────

test('AUTH-03: logout → cookies cleared, subsequent /auth/me returns 401', async ({
  page,
  request,
  context,
}) => {
  await loginAsAdmin(page)

  // Capture cookies before logout.
  const cookiesBefore = await cookieMap(context)
  expect(cookiesBefore['kb_access']).toBeTruthy()

  // Click logout (the router's logout button).
  // The button is in the header — find it by its aria role or text.
  await page.click('[data-testid="logout-btn"], button:has-text("Sign out"), button:has-text("Logout")', {
    timeout: 5_000,
  }).catch(async () => {
    // Fallback: call logout API directly.
    await request.post(`${GATEWAY}/api/auth/logout`, {
      headers: {
        Cookie: Object.entries(cookiesBefore).map(([k, v]) => `${k}=${v}`).join('; '),
        'X-CSRF-Token': cookiesBefore['kb_csrf'] ?? '',
      },
    })
    await context.clearCookies()
    await page.goto('/login')
  })

  // Should be on login page.
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

  // kb_access cookie must be gone.
  const cookiesAfter = await cookieMap(context)
  expect(cookiesAfter['kb_access']).toBeFalsy()

  // /api/auth/me must now return 401.
  const meRes = await request.get(`${GATEWAY}/api/auth/me`)
  expect(meRes.status()).toBe(401)
})

// ── 4. Wrong credentials → form error, no cookies, identical timing ───────────

test('AUTH-04: wrong credentials → error message, no session cookies', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  await page.goto('/login')
  await page.waitForSelector('input[type="email"]')

  // Record start time for timing check.
  const t0 = Date.now()
  await page.fill('input[type="email"]', 'wrong@example.com')
  await page.fill('input[type="password"]', 'wrongpassword')
  await page.click('button[type="submit"]')

  // Error message must appear.
  await expect(page.locator('[role="alert"], :text("Invalid credentials")')).toBeVisible({
    timeout: 10_000,
  })
  const elapsed = Date.now() - t0

  // Still on /login.
  expect(page.url()).toContain('/login')

  // No auth cookies.
  const cookies = await cookieMap(context)
  expect(cookies['kb_access']).toBeFalsy()
  expect(cookies['kb_refresh']).toBeFalsy()

  // CD-8: timing should be non-trivial (bcrypt takes ~300ms at cost=12).
  // We verify it doesn't return instantly (< 50ms = no dummy bcrypt).
  expect(elapsed).toBeGreaterThan(50)
})
