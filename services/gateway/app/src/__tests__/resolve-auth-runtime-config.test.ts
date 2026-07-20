/**
 * Regression test: env vars (AUTH_ACCESS_TTL_SEC, AUTH_REFRESH_TTL_SEC,
 * AUTH_COOKIE_SECURE) must win over config.auth's zod-defaulted fields.
 *
 * config.auth is optional in the raw JSON, but once the `auth` object is
 * present at all (which it now always is, since kb-create writes
 * gateway.auth.bootstrap on every non-local install), zod applies its own
 * schema defaults (sessionAccessTtlSec: 900, cookieSecure: true, etc.) to
 * every field, not just the ones actually set. The old
 * `config.auth?.X ?? envFallback` precedence meant the env fallback was
 * unreachable once `auth` existed at all — this silently broke every E2E
 * suite relying on AUTH_ACCESS_TTL_SEC/AUTH_REFRESH_TTL_SEC/
 * AUTH_COOKIE_SECURE for short-TTL / HTTP-only testing (e.g.
 * e2e/auth/specs/02-session-lifecycle.spec.ts AUTH-06, which waited for a
 * refresh token to expire that was actually still good for 15 more minutes).
 */
import { describe, it, expect } from 'vitest';
import { resolveAuthRuntimeConfig } from '../bootstrap.js';
import type { AuthConfig } from '@kb-labs/gateway-contracts';

// Shape zod actually produces once `auth` is present in the raw config —
// every field zod-defaulted, not just the ones explicitly set (this is what
// bit us: a real installed platform's config.auth looks exactly like this).
const ZOD_DEFAULTED_AUTH_CONFIG: AuthConfig = {
  enabled: true,
  cookieSecure: true,
  sessionAccessTtlSec: 900,
  sessionRefreshTtlSec: 30 * 24 * 3600,
  refreshGraceWindowSec: 5,
  bcryptCost: 12,
  passwordPolicy: { minLength: 8, maxLength: 256, hibpEnabled: true },
  rateLimit: { loginPerIpPerMinute: 10, loginPerEmailPerMinute: 5, activatePerIpPerHour: 10 },
  inviteTtlMs: 7 * 24 * 60 * 60 * 1000,
  bootstrap: { adminEmail: 'admin@bootstrap.local', tenantId: 'default', provisionCliCredentials: true },
};

describe('resolveAuthRuntimeConfig', () => {
  it('env vars win over a zod-defaulted config.auth (the actual regression)', () => {
    const result = resolveAuthRuntimeConfig(ZOD_DEFAULTED_AUTH_CONFIG, {
      AUTH_ACCESS_TTL_SEC: '5',
      AUTH_REFRESH_TTL_SEC: '15',
      AUTH_COOKIE_SECURE: 'false',
    } as NodeJS.ProcessEnv);

    expect(result.accessTtlSec).toBe(5);
    expect(result.refreshTtlSec).toBe(15);
    expect(result.cookieSecure).toBe(false);
  });

  it('falls back to config.auth values when no env override is set', () => {
    const result = resolveAuthRuntimeConfig(ZOD_DEFAULTED_AUTH_CONFIG, {} as NodeJS.ProcessEnv);

    expect(result.accessTtlSec).toBe(900);
    expect(result.refreshTtlSec).toBe(30 * 24 * 3600);
    expect(result.cookieSecure).toBe(true);
    expect(result.bcryptCost).toBe(12);
    expect(result.graceWindowMs).toBe(5000);
  });

  it('falls back to hardcoded defaults when config.auth is entirely absent and no env override', () => {
    const result = resolveAuthRuntimeConfig(undefined, {} as NodeJS.ProcessEnv);

    expect(result.accessTtlSec).toBe(900);
    expect(result.refreshTtlSec).toBe(30 * 24 * 3600);
    expect(result.cookieSecure).toBe(true);
    expect(result.bcryptCost).toBe(12);
    expect(result.graceWindowMs).toBe(5000);
  });

  it('AUTH_COOKIE_SECURE only disables when exactly "false" — any other value keeps config/default', () => {
    const result = resolveAuthRuntimeConfig(ZOD_DEFAULTED_AUTH_CONFIG, {
      AUTH_COOKIE_SECURE: 'nope',
    } as NodeJS.ProcessEnv);

    expect(result.cookieSecure).toBe(true);
  });

  it('env vars also win when config.auth is absent (env-only override, e.g. no bootstrap block written yet)', () => {
    const result = resolveAuthRuntimeConfig(undefined, {
      AUTH_ACCESS_TTL_SEC: '5',
      AUTH_REFRESH_TTL_SEC: '15',
    } as NodeJS.ProcessEnv);

    expect(result.accessTtlSec).toBe(5);
    expect(result.refreshTtlSec).toBe(15);
  });
});
