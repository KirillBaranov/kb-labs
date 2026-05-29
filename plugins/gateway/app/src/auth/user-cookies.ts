/**
 * @module @kb-labs/gateway-app/auth/user-cookies
 *
 * Canonical cookie names + setter / clearer helpers for the user-auth
 * flow (ADR-0020).
 *
 * The triple:
 * - `kb_access`   — HttpOnly, holds the access JWT. Path `/`. TTL = access TTL.
 * - `kb_refresh`  — HttpOnly, holds the refresh JWT. Path `/api/auth/refresh`.
 *                   TTL = refresh TTL.
 * - `kb_csrf`     — non-HttpOnly so Studio JS can read it and echo via
 *                   X-CSRF-Token. Path `/`. TTL = refresh TTL (matches the
 *                   longest-lived cookie so it survives access rotation).
 *
 * No `Domain` attribute — cookies are origin-scoped to `{tenant}.kblabs.ru`,
 * structurally preventing cross-tenant leakage.
 *
 * Production sets `Secure` and `SameSite=Strict`. Dev (cookieSecure=false)
 * drops `Secure` so http://localhost works without a cert.
 */

import type { FastifyReply } from 'fastify';

export const COOKIE_ACCESS = 'kb_access';
export const COOKIE_REFRESH = 'kb_refresh';
export const COOKIE_CSRF = 'kb_csrf';
export const COOKIE_OAUTH_STATE = 'kb_oauth_state';

export const REFRESH_COOKIE_PATH = '/api/auth/refresh';
export const OAUTH_COOKIE_PATH = '/api/auth/oauth';

export interface CookieOptions {
  /** False in dev (http://localhost), true in prod (https) — set Secure flag. */
  cookieSecure: boolean;
}

export interface SetSessionCookiesInput {
  accessToken: string;
  accessTtlSec: number;
  refreshToken: string;
  refreshTtlSec: number;
  csrfToken: string;
}

const baseAttrs = (cookieSecure: boolean, ttlSec: number) => ({
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'strict' as const,
  maxAge: ttlSec,
});

/**
 * Write all three session cookies on the reply.
 *
 * The `kb_csrf` cookie is non-HttpOnly — the SPA must be able to read
 * it via document.cookie and submit it via X-CSRF-Token. Its `maxAge`
 * matches the refresh TTL so a long-running session doesn't lose CSRF
 * cover between access rotations.
 */
export const setSessionCookies = (
  reply: FastifyReply,
  input: SetSessionCookiesInput,
  opts: CookieOptions,
): void => {
  reply.setCookie(COOKIE_ACCESS, input.accessToken, {
    ...baseAttrs(opts.cookieSecure, input.accessTtlSec),
    path: '/',
  });
  reply.setCookie(COOKIE_REFRESH, input.refreshToken, {
    ...baseAttrs(opts.cookieSecure, input.refreshTtlSec),
    path: REFRESH_COOKIE_PATH,
  });
  reply.setCookie(COOKIE_CSRF, input.csrfToken, {
    // CSRF cookie is NON-HttpOnly so JS can read it.
    httpOnly: false,
    secure: opts.cookieSecure,
    sameSite: 'strict' as const,
    maxAge: input.refreshTtlSec,
    path: '/',
  });
};

/**
 * The OAuth state cookie binds the browser that *started* a flow to the
 * one that *finishes* it (defence against state-fixation / login CSRF).
 *
 * It MUST be `SameSite=Lax`, NOT Strict: the IdP→callback hop is a
 * cross-site top-level navigation, and a Strict cookie would not be sent
 * on it, breaking the binding. Lax still blocks cross-site sub-resource
 * sends, which is all we need here. Scoped to the OAuth path so it never
 * rides along with normal API calls.
 */
export const setOAuthStateCookie = (
  reply: FastifyReply,
  state: string,
  opts: CookieOptions,
  ttlSec: number,
): void => {
  reply.setCookie(COOKIE_OAUTH_STATE, state, {
    httpOnly: true,
    secure: opts.cookieSecure,
    sameSite: 'lax' as const,
    maxAge: ttlSec,
    path: OAUTH_COOKIE_PATH,
  });
};

export const clearOAuthStateCookie = (reply: FastifyReply, opts: CookieOptions): void => {
  reply.clearCookie(COOKIE_OAUTH_STATE, {
    secure: opts.cookieSecure,
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE_PATH,
  });
};

export const clearSessionCookies = (reply: FastifyReply, opts: CookieOptions): void => {
  const common = { secure: opts.cookieSecure, sameSite: 'strict' as const };
  reply.clearCookie(COOKIE_ACCESS, { ...common, path: '/' });
  reply.clearCookie(COOKIE_REFRESH, { ...common, path: REFRESH_COOKIE_PATH });
  reply.clearCookie(COOKIE_CSRF, { ...common, path: '/' });
};
