/**
 * @module @kb-labs/gateway-auth/password-policy
 *
 * Password validation rules (ADR-0020, Phase 1.6).
 *
 * Length: 8..256. No complexity rules — NIST 800-63B explicitly
 * recommends against them.
 *
 * HIBP check via k-anonymity (https://haveibeenpwned.com/API/v3#PwnedPasswords):
 * we send the first 5 hex chars of SHA-1(password) and grep the
 * suffix list locally. The full password never leaves the process.
 *
 * Availability vs. UX trade-off: HIBP outages return `{ ok: true,
 * warning: 'hibp_unavailable' }`. A security check that hard-fails on
 * network glitches breaks more user flows than it protects — we log
 * the warning and let the activation/change-password flow continue.
 */

import { createHash } from 'node:crypto';

export type ValidationResult =
  | { ok: true; warning?: 'hibp_unavailable' }
  | { ok: false; reason: 'too_short' | 'too_long' | 'pwned' };

export interface PasswordPolicyLogger {
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface PasswordPolicyOptions {
  minLength: number;
  maxLength: number;
  hibpEnabled: boolean;
  /** Override for tests. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Override for tests / production logger. Defaults to console-shaped no-op. */
  logger?: PasswordPolicyLogger;
}

export interface PasswordPolicy {
  validate(plain: string): Promise<ValidationResult>;
}

const noopLogger: PasswordPolicyLogger = {
  warn: () => undefined,
  info: () => undefined,
  error: () => undefined,
};

const sha1Hex = (input: string): string =>
  createHash('sha1').update(input).digest('hex').toUpperCase();

/**
 * Returns the count of breach occurrences if the (sha1, suffix) is in
 * HIBP, or `0` if absent. Throws on network / non-2xx errors.
 */
const queryHibp = async (
  plain: string,
  doFetch: typeof fetch,
): Promise<number> => {
  const hash = sha1Hex(plain);
  const prefix = hash.slice(0, 5);
  const wantedSuffix = hash.slice(5);
  const resp = await doFetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  if (!resp.ok) {
    throw new Error(`HIBP ${resp.status}`);
  }
  const text = await resp.text();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {continue;}
    const sepIdx = trimmed.indexOf(':');
    if (sepIdx < 0) {continue;}
    const suffix = trimmed.slice(0, sepIdx).toUpperCase();
    if (suffix === wantedSuffix) {
      const count = Number.parseInt(trimmed.slice(sepIdx + 1), 10);
      return Number.isFinite(count) ? count : 1;
    }
  }
  return 0;
};

export const createPasswordPolicy = (opts: PasswordPolicyOptions): PasswordPolicy => {
  const log = opts.logger ?? noopLogger;
  const doFetch = opts.fetch ?? fetch;

  return {
    async validate(plain: string): Promise<ValidationResult> {
      if (plain.length < opts.minLength) {
        return { ok: false, reason: 'too_short' };
      }
      if (plain.length > opts.maxLength) {
        return { ok: false, reason: 'too_long' };
      }
      if (!opts.hibpEnabled) {
        return { ok: true };
      }
      try {
        const count = await queryHibp(plain, doFetch);
        if (count > 0) {
          return { ok: false, reason: 'pwned' };
        }
        return { ok: true };
      } catch (err) {
        log.warn('password-policy: HIBP unavailable, accepting password', { err: String(err) });
        return { ok: true, warning: 'hibp_unavailable' };
      }
    },
  };
};
