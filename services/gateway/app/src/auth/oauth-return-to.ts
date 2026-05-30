/**
 * @module @kb-labs/gateway-app/auth/oauth-return-to
 *
 * Open-redirect guard for the OAuth flow (ADR-0020, Step 4b).
 *
 * `returnTo` is attacker-influenceable (it rides in the `/start` query
 * string). After a successful callback we redirect the now-authenticated
 * browser to it, so it MUST be a same-origin relative path — never an
 * absolute or protocol-relative URL that could bounce the user to a
 * phishing origin.
 *
 * Whitelist: a path that starts with a single `/` not followed by another
 * `/` or a `\` (browsers normalise `/\` to `//`, i.e. protocol-relative).
 * Anything else collapses to `/`.
 */

// Starts with '/', and the next char (if any) is not '/' or '\'.
const SAFE_RELATIVE_PATH = /^\/(?![/\\])/;

export function validateReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '/';
  }
  if (!SAFE_RELATIVE_PATH.test(raw)) {
    return '/';
  }
  return raw;
}
