/**
 * Tests for the document-backed users store (ADR-0020, Phase 1.1).
 *
 * Critical behaviours covered:
 * - Email canonicalisation on every write/read path (CD-4) — lowercase +
 *   trim on the way in, stored as lowercase, lookups normalise too.
 * - Unique compound `(tenantId, email)` — duplicates within one tenant
 *   throw; the same email in different tenants is allowed.
 * - No `setPasswordHash` method exists; credentials live in their own
 *   collection (CD-6).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { UsersStore } from '../users-store.js';

const t1 = 'tenant-a';
const t2 = 'tenant-b';

let docs: IDocumentDatabase;
let users: UsersStore;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  users = new UsersStore(docs);
});

describe('UsersStore.create + getById', () => {
  it('round-trips a user', async () => {
    await users.create({
      userId: 'u1',
      tenantId: t1,
      email: 'alice@example.com',
      status: 'pending',
    });
    const got = await users.getById('u1');
    expect(got).toMatchObject({
      userId: 'u1',
      tenantId: t1,
      email: 'alice@example.com',
      status: 'pending',
    });
  });

  it('returns null for unknown userId', async () => {
    expect(await users.getById('nope')).toBeNull();
  });
});

describe('Email canonicalisation (CD-4)', () => {
  it('stores email lowercased and trimmed on create', async () => {
    await users.create({
      userId: 'u1',
      tenantId: t1,
      email: '  ALICE@EXAMPLE.COM  ',
      status: 'pending',
    });
    const got = await users.getById('u1');
    expect(got?.email).toBe('alice@example.com');
  });

  it('finds users by email regardless of case or surrounding whitespace', async () => {
    await users.create({
      userId: 'u1',
      tenantId: t1,
      email: 'alice@example.com',
      status: 'active',
    });
    expect(await users.findByEmailTenant('Alice@Example.COM', t1)).toMatchObject({ userId: 'u1' });
    expect(await users.findByEmailTenant('  alice@example.com  ', t1)).toMatchObject({ userId: 'u1' });
    expect(await users.findByEmailTenant('bob@example.com', t1)).toBeNull();
  });
});

describe('Uniqueness within a tenant', () => {
  it('rejects a duplicate email in the same tenant', async () => {
    await users.create({ userId: 'u1', tenantId: t1, email: 'alice@example.com', status: 'pending' });
    await expect(
      users.create({ userId: 'u2', tenantId: t1, email: 'ALICE@example.com', status: 'pending' }),
    ).rejects.toThrow();
  });

  it('allows the same email in different tenants', async () => {
    await users.create({ userId: 'u1', tenantId: t1, email: 'alice@example.com', status: 'pending' });
    await expect(
      users.create({ userId: 'u2', tenantId: t2, email: 'alice@example.com', status: 'pending' }),
    ).resolves.not.toThrow();
    expect(await users.findByEmailTenant('alice@example.com', t1)).toMatchObject({ userId: 'u1' });
    expect(await users.findByEmailTenant('alice@example.com', t2)).toMatchObject({ userId: 'u2' });
  });
});

describe('setStatus', () => {
  it('updates status', async () => {
    await users.create({ userId: 'u1', tenantId: t1, email: 'a@b.c', status: 'pending' });
    await users.setStatus('u1', 'active');
    expect((await users.getById('u1'))?.status).toBe('active');
    await users.setStatus('u1', 'disabled');
    expect((await users.getById('u1'))?.status).toBe('disabled');
  });

  it('throws or is a no-op for unknown user (we choose throw for safety)', async () => {
    await expect(users.setStatus('nope', 'active')).rejects.toThrow();
  });
});

describe('delete', () => {
  it('removes the user', async () => {
    await users.create({ userId: 'u1', tenantId: t1, email: 'a@b.c', status: 'active' });
    await users.delete('u1');
    expect(await users.getById('u1')).toBeNull();
  });

  it('is idempotent', async () => {
    await expect(users.delete('nope')).resolves.not.toThrow();
  });
});

describe('CD-6 — no password hash on User', () => {
  it('UsersStore does not expose setPasswordHash', () => {
    // Compile-time + runtime check — credentials live in CredentialsStore.
    // @ts-expect-error — method must not exist.
    const fn = users.setPasswordHash;
    expect(fn).toBeUndefined();
  });
});
