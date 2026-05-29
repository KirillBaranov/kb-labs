/**
 * Tests for the identity provider loader (ADR-0020, Phase 1.13 / DD-3).
 *
 * The loader is the gateway-side analogue of the platform adapter loader:
 * config-driven, factory-based, with the built-in `email-password`
 * provider as the zero-config default — NOT hardcoded in bootstrap.
 *
 * Invariants under test:
 * - Empty / absent `providers` config → the built-in `email-password`
 *   provider is registered (the default door).
 * - An explicit `{ 'email-password': { type: 'email-password' } }` entry
 *   produces the same provider.
 * - A non-builtin `type` is treated as a package name; if it cannot be
 *   imported the loader **fails fast** (throws) rather than silently
 *   skipping — a misconfigured auth door must never boot half-open.
 * - Deps (the narrow ports) are injected into the built provider.
 * - Duplicate provider ids surface as a throw (via the registry).
 */

import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type {
  IdentityProviderDeps,
  IdentityUserPort,
  IdentityCredentialPort,
  IdentityUserRecord,
  IdentityCredentialRecord,
} from '@kb-labs/core-contracts';
import { loadIdentityProviders } from '../provider-loader.js';

const TENANT = 'tenant-a';

const noopLogger = {
  warn: () => {},
  info: () => {},
  error: () => {},
};

function makeDeps(overrides: Partial<IdentityProviderDeps> = {}): IdentityProviderDeps {
  const users: IdentityUserPort = {
    findByEmailTenant: async () => null,
  };
  const credentials: IdentityCredentialPort = {
    getCredential: async () => null,
  };
  return {
    users,
    credentials,
    tenantId: TENANT,
    bcryptCost: 4,
    logger: noopLogger,
    ...overrides,
  };
}

describe('loadIdentityProviders', () => {
  it('registers the built-in email-password provider when no providers are configured', async () => {
    const registry = await loadIdentityProviders(undefined, makeDeps());
    expect(registry.list()).toEqual([{ id: 'email-password', kind: 'password' }]);
  });

  it('treats an empty providers object the same as undefined (default door)', async () => {
    const registry = await loadIdentityProviders({}, makeDeps());
    expect(registry.list()).toEqual([{ id: 'email-password', kind: 'password' }]);
  });

  it('registers email-password from an explicit config entry', async () => {
    const registry = await loadIdentityProviders(
      { 'email-password': { type: 'email-password' } },
      makeDeps(),
    );
    const provider = registry.get('email-password');
    expect(provider?.kind).toBe('password');
  });

  it('fails fast when a configured non-builtin type cannot be imported', async () => {
    await expect(
      loadIdentityProviders(
        { corp: { type: '@kb-labs/identity-provider-does-not-exist-xyz' } },
        makeDeps(),
      ),
    ).rejects.toThrow();
  });

  it('injects the narrow ports into the built provider', async () => {
    // Build a real bcrypt hash so the provider's compare succeeds and we
    // prove the credential port was wired through.
    const hash = await bcrypt.hash('s3cret-passw0rd', 4);
    const user: IdentityUserRecord = {
      userId: 'u1',
      tenantId: TENANT,
      email: 'alice@example.com',
      status: 'active',
    };
    const cred: IdentityCredentialRecord = {
      userId: 'u1',
      providerId: 'email-password',
      hash,
    };

    let userLookups = 0;
    const users: IdentityUserPort = {
      findByEmailTenant: async (email, tenantId) => {
        userLookups += 1;
        return email === user.email && tenantId === TENANT ? user : null;
      },
    };
    const credentials: IdentityCredentialPort = {
      getCredential: async (userId, providerId) =>
        userId === 'u1' && providerId === 'email-password' ? cred : null,
    };

    const registry = await loadIdentityProviders(undefined, makeDeps({ users, credentials }));
    const provider = registry.get('email-password')!;
    const result = await provider.authenticate({
      email: 'alice@example.com',
      password: 's3cret-passw0rd',
    });

    expect(userLookups).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe('alice@example.com');
      expect(result.externalId).toBe('u1');
    }
  });

  it('assembles the built-in oidc redirect provider from config', async () => {
    // The instance id is the config key (`corp`); the loader injects it so the
    // provider can self-identify and build its per-instance callback URL.
    const registry = await loadIdentityProviders(
      {
        corp: {
          type: 'oidc',
          issuer: 'https://idp.example.com',
          clientId: 'client-abc',
          clientSecret: 'shh',
        },
      },
      makeDeps(),
    );
    expect(registry.list()).toEqual([{ id: 'corp', kind: 'redirect' }]);
  });

  it('throws when two entries resolve to the same provider id', async () => {
    await expect(
      loadIdentityProviders(
        {
          a: { type: 'email-password' },
          b: { type: 'email-password' },
        },
        makeDeps(),
      ),
    ).rejects.toThrow(/already registered/);
  });
});
