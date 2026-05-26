/**
 * Tests for the password policy (ADR-0020, Phase 1.6).
 *
 * Rules:
 * - Length 8..256. No complexity requirements (NIST 800-63B).
 * - HIBP k-anonymity check via Pwned Passwords API. Plaintext never
 *   leaves the process — we send `SHA1(pwd).slice(0, 5)` and grep the
 *   returned suffix list locally.
 * - HIBP being unreachable is **not** a failure. We log a warning and
 *   pass the password through (a security check that hard-fails on
 *   network glitches breaks more user flows than it protects).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createPasswordPolicy } from '../password-policy.js';

let warnings: unknown[];

const collectWarnings = (..._: unknown[]) => {
  warnings.push(_);
};

beforeEach(() => {
  warnings = [];
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Length rules', () => {
  it('rejects passwords shorter than minLength', async () => {
    const policy = createPasswordPolicy({ minLength: 8, maxLength: 256, hibpEnabled: false });
    const r = await policy.validate('1234567');
    expect(r).toEqual({ ok: false, reason: 'too_short' });
  });

  it('accepts the minimum length', async () => {
    const policy = createPasswordPolicy({ minLength: 8, maxLength: 256, hibpEnabled: false });
    const r = await policy.validate('12345678');
    expect(r.ok).toBe(true);
  });

  it('rejects passwords longer than maxLength (bcrypt DoS guard)', async () => {
    const policy = createPasswordPolicy({ minLength: 8, maxLength: 256, hibpEnabled: false });
    const r = await policy.validate('a'.repeat(257));
    expect(r).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('HIBP integration', () => {
  it('rejects a known-leaked password (k-anonymity match)', async () => {
    // SHA1('password123') = cbfdac6008f9cab4083784cbd1874f76618d2a97
    // Prefix = cbfdac, suffix = 6008F9CAB4083784CBD1874F76618D2A97
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.pwnedpasswords.com/range/CBFDA');
      return new Response(
        [
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5',
          'C6008F9CAB4083784CBD1874F76618D2A97:42',
          'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1',
        ].join('\r\n'),
        { status: 200 },
      );
    });
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: true,
      fetch: fetchMock as unknown as typeof fetch,
      logger: { warn: collectWarnings, info: collectWarnings, error: collectWarnings },
    });
    const r = await policy.validate('password123');
    expect(r).toEqual({ ok: false, reason: 'pwned' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts an unknown password (no match in HIBP response)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('AAAA:1\r\nBBBB:2\r\n', { status: 200 }),
    );
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: true,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await policy.validate('long-strong-novel-password');
    expect(r).toEqual({ ok: true });
  });

  it('passes through with a warning when HIBP throws', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down'); });
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: true,
      fetch: fetchMock as unknown as typeof fetch,
      logger: { warn: collectWarnings, info: () => undefined, error: () => undefined },
    });
    const r = await policy.validate('long-strong-novel-password');
    expect(r).toEqual({ ok: true, warning: 'hibp_unavailable' });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('passes through with a warning when HIBP returns non-200', async () => {
    const fetchMock = vi.fn(async () => new Response('Server Error', { status: 503 }));
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: true,
      fetch: fetchMock as unknown as typeof fetch,
      logger: { warn: collectWarnings, info: () => undefined, error: () => undefined },
    });
    const r = await policy.validate('long-strong-novel-password');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toBe('hibp_unavailable');
  });

  it('does not call HIBP when hibpEnabled = false', async () => {
    const fetchMock = vi.fn();
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: false,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await policy.validate('password123'); // would be HIBP-rejected if enabled
    expect(r).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs length checks before HIBP (cheap-first)', async () => {
    const fetchMock = vi.fn();
    const policy = createPasswordPolicy({
      minLength: 8, maxLength: 256, hibpEnabled: true,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await policy.validate('short');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
