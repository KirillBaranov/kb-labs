/**
 * Tests for validateReturnTo (ADR-0020, OAuth open-redirect guard).
 *
 * After a successful OAuth callback we 302 the browser to the path the
 * flow started from. An attacker who can seed `?returnTo=` must NOT be
 * able to bounce the freshly-authenticated user to an external origin
 * (phishing / token-leak landing). Whitelist: a single-slash relative
 * path only. Everything else collapses to `/`.
 */

import { describe, expect, it } from 'vitest';
import { validateReturnTo } from '../oauth-return-to.js';

describe('validateReturnTo', () => {
  it('accepts a same-origin relative path', () => {
    expect(validateReturnTo('/dashboard')).toBe('/dashboard');
    expect(validateReturnTo('/a/b/c?q=1#h')).toBe('/a/b/c?q=1#h');
    expect(validateReturnTo('/')).toBe('/');
  });

  it('rejects absolute URLs (open redirect)', () => {
    expect(validateReturnTo('https://evil.com')).toBe('/');
    expect(validateReturnTo('http://evil.com/path')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(validateReturnTo('//evil.com')).toBe('/');
    expect(validateReturnTo('//evil.com/path')).toBe('/');
  });

  it('rejects backslash-tricks browsers normalise to //', () => {
    expect(validateReturnTo('/\\evil.com')).toBe('/');
    expect(validateReturnTo('\\/evil.com')).toBe('/');
  });

  it('rejects non-string / empty / non-leading-slash input', () => {
    expect(validateReturnTo(undefined)).toBe('/');
    expect(validateReturnTo('')).toBe('/');
    expect(validateReturnTo('dashboard')).toBe('/');
    expect(validateReturnTo(42 as unknown as string)).toBe('/');
  });
});
