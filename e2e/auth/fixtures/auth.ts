/**
 * Shared fixtures and helpers for auth E2E tests (ADR-0020, Phase 4).
 *
 * Provides:
 *   - loginAs(page, email, password)  — fill login form and submit
 *   - inviteUser(api, email)          — POST /api/auth/invites as admin
 *   - activateUser(page, url, pwd)    — open activation link and set password
 *   - adminApi(request)               — APIRequestContext logged in as admin
 *   - cookieMap(context)              — parse all cookies into a Record
 */

import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'

// ── Config ────────────────────────────────────────────────────────────────────

export const GATEWAY    = process.env.GATEWAY_URL    ?? 'http://localhost:4000'
export const STUDIO_URL = process.env.STUDIO_URL     ?? 'http://localhost:4000'
export const TENANT_ID  = process.env.TENANT_ID      ?? 'kb-cloud'
export const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? 'admin@kb-cloud.test'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AdminPass123!'

// ── Login helpers ─────────────────────────────────────────────────────────────

/** Fill the login form and submit. Waits for navigation away from /login. */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.waitForSelector('input[type="email"]')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
}

/** Login as bootstrap admin. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD)
}

// ── API helpers ───────────────────────────────────────────────────────────────

/** Returns headers with a valid admin session cookie. Call after loginAsAdmin. */
export async function getAdminCookieHeader(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies()
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/**
 * POST /api/auth/invites as admin.
 * Returns the activationUrl from the response.
 *
 * @param options.ttlMs - Optional invite TTL override in milliseconds.
 *   Use to create short-lived invites for expiry tests (e.g. AUTH-14).
 *   Defaults to the server's global invite TTL (7 days in CI).
 */
export async function inviteUser(
  request: APIRequestContext,
  email: string,
  adminCookieHeader: string,
  options?: { ttlMs?: number },
): Promise<string> {
  const csrfToken = await getCsrfFromCookie(request, adminCookieHeader)
  const data: Record<string, unknown> = { email, groupId: 'tenant-member' }
  if (options?.ttlMs !== undefined) {
    data['ttlMs'] = options.ttlMs
  }
  const res = await request.post(`${GATEWAY}/api/auth/invites`, {
    // groupId is required by the gateway (POST /api/auth/invites validates both email + groupId).
    data,
    headers: {
      Cookie: adminCookieHeader,
      'X-CSRF-Token': csrfToken ?? '',
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok()) throw new Error(`invite failed: ${res.status()} ${await res.text()}`)
  const body = await res.json() as { activationUrl: string }

  // The gateway builds activationUrl using request.host (e.g. "kb-cloud.kblabs.ru") which
  // is not resolvable in E2E CI environments. Extract the token and rewrite to STUDIO_URL
  // so activateUser() navigates to the locally-accessible Studio instance.
  // Gateway generates /activate/:token (path param format matching the SPA route).
  const parsed = new URL(body.activationUrl)
  const token = parsed.pathname.split('/').pop() || parsed.searchParams.get('token') || ''
  return `${STUDIO_URL}/activate/${token}`
}

/**
 * Navigate to activation URL, fill password, submit.
 * Waits for redirect to /.
 *
 * Uses waitUntil:'commit' instead of the default 'load' because:
 * - On success, activate-page calls window.location.replace('/') (full reload).
 * - The Vite app uses <script type="module"> (deferred). Module scripts execute
 *   BEFORE DOMContentLoaded, so React runs and RequireAuth redirects to /login
 *   (SPA pushState) before either 'domcontentloaded' or 'load' fires.
 * - Both browser events fire when URL is already '/login', so waitForURL('/')
 *   with 'load' or 'domcontentloaded' never resolves.
 * - 'commit' fires as soon as navigation response headers arrive, before the
 *   HTML body is delivered and before any scripts execute — guaranteed at URL='/'.
 * - The session cookies (kb_access, kb_refresh, kb_csrf) are set by the
 *   activation endpoint response BEFORE window.location.replace('/') is called,
 *   so callers can safely read cookieMap() after activateUser() returns.
 */
export async function activateUser(
  page: Page,
  activationUrl: string,
  password: string,
): Promise<void> {
  await page.goto(activationUrl)
  await page.waitForSelector('input[id="activate-password"]')
  await page.fill('input[id="activate-password"]', password)
  await page.fill('input[id="activate-confirm"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { waitUntil: 'commit', timeout: 15_000 })
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Returns all cookies for the context as a Record<name, value>. */
export async function cookieMap(context: BrowserContext): Promise<Record<string, string>> {
  const cookies = await context.cookies()
  return Object.fromEntries(cookies.map((c) => [c.name, c.value]))
}

/**
 * Extract kb_csrf from the Cookie header string.
 * Used when we need to pass CSRF on subsequent API requests.
 */
function getCsrfFromCookieHeader(cookieHeader: string): string | undefined {
  const match = cookieHeader.match(/kb_csrf=([^;]+)/)
  return match?.[1]
}

async function getCsrfFromCookie(
  _request: APIRequestContext,
  cookieHeader: string,
): Promise<string | undefined> {
  return getCsrfFromCookieHeader(cookieHeader)
}

// ── Unique email factory ──────────────────────────────────────────────────────

let counter = 0
/** Generate a unique test email to avoid conflicts between test runs. */
export function uniqueEmail(prefix = 'user'): string {
  return `e2e-${prefix}-${Date.now()}-${++counter}@kb-cloud.test`
}

// ── Gateway API shorthand ─────────────────────────────────────────────────────

/** Perform an authenticated GET against the gateway API. */
export async function apiGet(
  request: APIRequestContext,
  path: string,
  cookieHeader: string,
): Promise<{ status: number; body: unknown }> {
  const res = await request.get(`${GATEWAY}${path}`, {
    headers: { Cookie: cookieHeader },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status(), body }
}

/** Perform an authenticated POST against the gateway API. */
export async function apiPost(
  request: APIRequestContext,
  path: string,
  cookieHeader: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  // Extract CSRF from cookie string
  const csrf = getCsrfFromCookieHeader(cookieHeader)
  const res = await request.post(`${GATEWAY}${path}`, {
    data,
    headers: {
      Cookie: cookieHeader,
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      // Only set Content-Type when there is a body — sending it with an empty body
      // causes Fastify's JSON body-parser to reject the request with 400.
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status(), body }
}
