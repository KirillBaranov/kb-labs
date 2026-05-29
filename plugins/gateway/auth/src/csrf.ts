/**
 * @module @kb-labs/gateway-auth/csrf
 *
 * Double-submit CSRF helpers (ADR-0020, Phase 1.7).
 *
 * The contract is intentionally minimal: a token is just an opaque
 * random string and verification is a constant-time string compare.
 * No server-side state, no rotation logic — the cookie + header pair
 * is the entire protocol.
 *
 * The `Path=/` non-HttpOnly cookie is set in the route layer
 * alongside `kb_access`. Studio JS reads it via `document.cookie` and
 * echoes it via `X-CSRF-Token` on every mutating request.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a fresh 32-byte token, base64url-encoded.
 */
export const issueCsrfToken = (): string => randomBytes(32).toString('base64url');

/**
 * Verify the double-submit pair.
 *
 * Returns `true` only when both inputs are non-empty strings of the
 * same length and equal under a constant-time compare. Length
 * mismatches return `false` without involving timingSafeEqual (which
 * throws on length mismatch).
 */
export const verifyCsrfToken = (
  cookie: string | undefined,
  header: string | undefined,
): boolean => {
  if (!cookie || !header) {return false;}
  if (cookie.length !== header.length) {return false;}
  const a = Buffer.from(cookie, 'utf8');
  const b = Buffer.from(header, 'utf8');
  // Buffers of identical length — safe to call timingSafeEqual.
  return timingSafeEqual(a, b);
};
