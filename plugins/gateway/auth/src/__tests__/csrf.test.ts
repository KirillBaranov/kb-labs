/**
 * Tests for the CSRF double-submit token utility (ADR-0020, Phase 1.7).
 *
 * The pattern: server sets a non-HttpOnly cookie `kb_csrf`, the SPA
 * reads it and echoes it on every mutating cookie-authenticated
 * request via the `X-CSRF-Token` header. The server verifies that the
 * two values match.
 *
 * - `issueToken()` returns a fresh opaque base64url-encoded 32-byte
 *   token. No state is kept server-side — that's the whole point of
 *   double-submit.
 * - `verifyToken(cookie, header)` is true only when both are present,
 *   identical, and use a constant-time compare so timing leaks don't
 *   reveal which bytes diverged.
 */

import { describe, expect, it } from 'vitest';
import { issueCsrfToken, verifyCsrfToken } from '../csrf.js';

describe('issueCsrfToken', () => {
  it('returns a base64url string with at least 43 chars (32 bytes)', () => {
    const t = issueCsrfToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it('returns a different value each call', () => {
    const a = issueCsrfToken();
    const b = issueCsrfToken();
    expect(a).not.toBe(b);
  });
});

describe('verifyCsrfToken', () => {
  it('returns true when cookie and header match exactly', () => {
    const t = issueCsrfToken();
    expect(verifyCsrfToken(t, t)).toBe(true);
  });

  it('returns false for different values', () => {
    expect(verifyCsrfToken('aaaa', 'bbbb')).toBe(false);
  });

  it('returns false for empty cookie', () => {
    expect(verifyCsrfToken('', 'anything')).toBe(false);
  });

  it('returns false for empty header', () => {
    expect(verifyCsrfToken('anything', '')).toBe(false);
  });

  it('returns false when either side is undefined', () => {
    expect(verifyCsrfToken(undefined, 'x')).toBe(false);
    expect(verifyCsrfToken('x', undefined)).toBe(false);
    expect(verifyCsrfToken(undefined, undefined)).toBe(false);
  });

  it('returns false when lengths differ (no early-return timing leak)', () => {
    expect(verifyCsrfToken('short', 'a-much-longer-value')).toBe(false);
  });
});
