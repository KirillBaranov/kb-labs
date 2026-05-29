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
  type IPasswordIdentityProvider,
  type IRedirectIdentityProvider,
  type IdentityResult,
  type RedirectStartContext,
  type RedirectStartResult,
  type IdentityUserPort,
  type IdentityCredentialPort,
  type IdentityUserRecord,
  type IdentityCredentialRecord,
  type IdentityProviderDeps,
  type IdentityProviderFactory,
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

describe('IIdentityProvider union (DD-1)', () => {
  it('narrows by `kind` — only the redirect member has startAuthorization', () => {
    const provider = {} as IIdentityProvider;
    if (provider.kind === 'redirect') {
      expectTypeOf(provider).toEqualTypeOf<IRedirectIdentityProvider>();
      expectTypeOf(provider).toHaveProperty('startAuthorization');
    } else {
      expectTypeOf(provider).toEqualTypeOf<IPasswordIdentityProvider>();
      // @ts-expect-error — password member must NOT expose startAuthorization.
      void provider.startAuthorization;
    }
  });

  it('exposes authenticate(input: unknown) on the union WITHOUT narrowing (DD-1)', () => {
    const provider = {} as IIdentityProvider;
    // Callable directly on the union — this is the invariant DD-1 protects.
    expectTypeOf(provider.authenticate).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(provider.authenticate).returns.resolves.toEqualTypeOf<IdentityResult>();
  });

  it('password member has no startAuthorization; redirect member does', () => {
    expectTypeOf<IPasswordIdentityProvider>()
      .toHaveProperty('kind')
      .toEqualTypeOf<'password'>();
    expectTypeOf<IRedirectIdentityProvider>()
      .toHaveProperty('kind')
      .toEqualTypeOf<'redirect'>();
    expectTypeOf<IRedirectIdentityProvider>().toHaveProperty('startAuthorization');
    // @ts-expect-error — startAuthorization is not on the password member.
    expectTypeOf<IPasswordIdentityProvider>().toHaveProperty('startAuthorization');
  });

  it('startAuthorization maps a RedirectStartContext to a RedirectStartResult', () => {
    expectTypeOf<IRedirectIdentityProvider['startAuthorization']>()
      .parameter(0)
      .toEqualTypeOf<RedirectStartContext>();
    expectTypeOf<IRedirectIdentityProvider['startAuthorization']>()
      .returns.resolves.toEqualTypeOf<RedirectStartResult>();

    const ctx: RedirectStartContext = { state: 's', redirectUri: 'https://x/cb' };
    const res: RedirectStartResult = { redirectUrl: 'https://idp/authorize', session: { nonce: 'n' } };
    expect(ctx.state).toBe('s');
    expect(res.redirectUrl).toBe('https://idp/authorize');
  });
});

describe('narrow identity ports (DD-2)', () => {
  it('IdentityUserPort.findByEmailTenant returns a nullable IdentityUserRecord', () => {
    expectTypeOf<IdentityUserPort['findByEmailTenant']>()
      .returns.resolves.toEqualTypeOf<IdentityUserRecord | null>();
    const rec: IdentityUserRecord = { userId: 'u', tenantId: 't', email: 'a@b.c', status: 'active' };
    expectTypeOf(rec.status).toEqualTypeOf<'pending' | 'active' | 'disabled'>();
  });

  it('IdentityCredentialPort.getCredential returns a nullable IdentityCredentialRecord', () => {
    expectTypeOf<IdentityCredentialPort['getCredential']>()
      .returns.resolves.toEqualTypeOf<IdentityCredentialRecord | null>();
    const cred: IdentityCredentialRecord = { userId: 'u', providerId: 'email-password', hash: 'h' };
    expect(cred.providerId).toBe('email-password');
  });

  it('IdentityProviderDeps bundles the ports, tenant, bcryptCost, logger, optional fetch', () => {
    expectTypeOf<IdentityProviderDeps>().toHaveProperty('users').toEqualTypeOf<IdentityUserPort>();
    expectTypeOf<IdentityProviderDeps>().toHaveProperty('credentials').toEqualTypeOf<IdentityCredentialPort>();
    expectTypeOf<IdentityProviderDeps>().toHaveProperty('tenantId').toEqualTypeOf<string>();
    expectTypeOf<IdentityProviderDeps>().toHaveProperty('bcryptCost').toEqualTypeOf<number>();
    expectTypeOf<IdentityProviderDeps>().toHaveProperty('logger');
  });

  it('IdentityProviderFactory takes (config, deps) and yields a provider', () => {
    type F = IdentityProviderFactory<{ issuer: string }>;
    expectTypeOf<F>().parameter(0).toEqualTypeOf<{ issuer: string }>();
    expectTypeOf<F>().parameter(1).toEqualTypeOf<IdentityProviderDeps>();
    expectTypeOf<F>().returns.toEqualTypeOf<IIdentityProvider | Promise<IIdentityProvider>>();
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
