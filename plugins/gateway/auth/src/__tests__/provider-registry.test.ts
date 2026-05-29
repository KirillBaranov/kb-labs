/**
 * Tests for the identity-provider registry (ADR-0020, Phase 1.11).
 *
 * Plain Map wrapper, but with two invariants worth pinning:
 * - Registering the same id twice throws (catches typos / accidental
 *   double-init at bootstrap).
 * - `list()` returns the public shape `{ id, kind }` — never the
 *   provider instance itself (no leaking `authenticate` over the wire
 *   when `GET /auth/providers` calls this).
 */

import { describe, expect, it } from 'vitest';
import type { IIdentityProvider } from '@kb-labs/core-contracts';
import { ProviderRegistry } from '../provider-registry.js';

const makeProvider = (id: string, kind: 'password' | 'redirect' = 'password'): IIdentityProvider => ({
  id,
  kind,
  authenticate: async () => ({ ok: true, email: 'x@y.z' }),
});

describe('register / get / has', () => {
  it('registers and retrieves a provider', () => {
    const reg = new ProviderRegistry();
    const p = makeProvider('email-password');
    reg.register(p);
    expect(reg.get('email-password')).toBe(p);
    expect(reg.has('email-password')).toBe(true);
  });

  it('returns undefined / false for unknown id', () => {
    const reg = new ProviderRegistry();
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.has('nope')).toBe(false);
  });

  it('throws on duplicate id', () => {
    const reg = new ProviderRegistry();
    reg.register(makeProvider('email-password'));
    expect(() => reg.register(makeProvider('email-password'))).toThrow();
  });
});

describe('list', () => {
  it('returns public { id, kind } only — no authenticate leakage', () => {
    const reg = new ProviderRegistry();
    reg.register(makeProvider('email-password', 'password'));
    reg.register(makeProvider('google', 'redirect'));
    const list = reg.list();
    expect(list).toHaveLength(2);
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted).toEqual([
      { id: 'email-password', kind: 'password' },
      { id: 'google', kind: 'redirect' },
    ]);
    // No `authenticate` on the returned objects.
    expect((sorted[0] as unknown as Record<string, unknown>).authenticate).toBeUndefined();
  });
});
