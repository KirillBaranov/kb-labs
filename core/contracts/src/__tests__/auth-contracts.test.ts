/**
 * Contract tests for identity & authentication (ADR-0020).
 *
 * Verifies that:
 * - All required types are exported from the package index.
 * - PERMISSIONS enum has the expected canonical permission strings.
 * - PERMISSIONS is frozen (readonly at runtime).
 * - Discriminated unions narrow correctly via type-level assertions.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  PERMISSIONS,
  type IIdentityProvider,
  type IdentityResult,
  type IPolicyDecisionPoint,
  type PolicyDecision,
  type Identity,
  type Resource,
  type PolicyContext,
  type Permission,
} from '../index.js';

describe('PERMISSIONS enum', () => {
  it('exposes the canonical set of permission strings', () => {
    expect(PERMISSIONS.USERS_READ).toBe('users:read');
    expect(PERMISSIONS.USERS_WRITE).toBe('users:write');
    expect(PERMISSIONS.INVITES_READ).toBe('invites:read');
    expect(PERMISSIONS.INVITES_WRITE).toBe('invites:write');
    expect(PERMISSIONS.MACHINE_REGISTER).toBe('machine:register');
  });

  it('is frozen so callers cannot mutate it at runtime', () => {
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
  });

  it('Permission type accepts only canonical strings', () => {
    const ok: Permission = 'users:write';
    expectTypeOf(ok).toMatchTypeOf<Permission>();
    // @ts-expect-error — arbitrary string is not assignable to Permission.
    const bad: Permission = 'nonexistent:permission';
    void bad;
  });
});

describe('IIdentityProvider contract', () => {
  it('requires id, kind, and authenticate', () => {
    expectTypeOf<IIdentityProvider>().toHaveProperty('id').toEqualTypeOf<string>();
    expectTypeOf<IIdentityProvider>()
      .toHaveProperty('kind')
      .toEqualTypeOf<'password' | 'redirect'>();
    expectTypeOf<IIdentityProvider>().toHaveProperty('authenticate');
  });

  it('IdentityResult is a discriminated union on `ok`', () => {
    const success: IdentityResult = { ok: true, email: 'a@b.c' };
    const failure: IdentityResult = { ok: false, reason: 'invalid' };
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    // Type narrowing
    if (success.ok) {
      expectTypeOf(success.email).toEqualTypeOf<string>();
    }
    if (!failure.ok) {
      expectTypeOf(failure.reason).toEqualTypeOf<'invalid' | 'disabled' | 'unknown'>();
    }
  });
});

describe('IPolicyDecisionPoint contract', () => {
  it('exposes check and enumeratePermissions', () => {
    expectTypeOf<IPolicyDecisionPoint>().toHaveProperty('check');
    expectTypeOf<IPolicyDecisionPoint>().toHaveProperty('enumeratePermissions');
  });

  it('PolicyDecision is a discriminated union on `allow`', () => {
    const allow: PolicyDecision = { allow: true };
    const deny: PolicyDecision = { allow: false, reason: 'no_membership' };
    expect(allow.allow).toBe(true);
    expect(deny.allow).toBe(false);
    if (!deny.allow) {
      expectTypeOf(deny.reason).toEqualTypeOf<string>();
    }
  });
});

describe('Identity shape', () => {
  it('carries userId, tenantId, and type (user|machine)', () => {
    const user: Identity = { userId: 'u1', tenantId: 't1', type: 'user' };
    const machine: Identity = { userId: 'm1', tenantId: 't1', type: 'machine' };
    expectTypeOf(user.type).toEqualTypeOf<'user' | 'machine'>();
    expect(user.userId).toBe('u1');
    expect(machine.type).toBe('machine');
  });

  it('does NOT include role, scopes, or permissions (CD-7, ADR principle 3)', () => {
    // @ts-expect-error — role must not be part of Identity.
    const bad1: Identity = { userId: 'u', tenantId: 't', type: 'user', role: 'admin' };
    // @ts-expect-error — scopes must not be part of Identity.
    const bad2: Identity = { userId: 'u', tenantId: 't', type: 'user', scopes: [] };
    void bad1;
    void bad2;
  });
});

describe('Resource and PolicyContext shapes', () => {
  it('Resource has type, optional id and tenantId', () => {
    const r1: Resource = { type: 'invite' };
    const r2: Resource = { type: 'user', id: 'u1', tenantId: 't1' };
    expect(r1.type).toBe('invite');
    expect(r2.id).toBe('u1');
  });

  it('PolicyContext is an open record', () => {
    const ctx: PolicyContext = { ip: '1.2.3.4', ua: 'test' };
    expect(ctx.ip).toBe('1.2.3.4');
  });
});

describe('Required exports surface', () => {
  it('lists all auth contract names at the entrypoint', async () => {
    const mod = await import('../index.js');
    expect(mod).toHaveProperty('PERMISSIONS');
    // Types are erased at runtime; we only assert the value exports.
  });
});
