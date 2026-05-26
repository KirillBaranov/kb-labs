/**
 * Tests for the memberships store (ADR-0020, Phase 1.3).
 *
 * A `Membership` ties a user to a tenant with a `groupId`. Group strings
 * are hardcoded for this iteration (`tenant-admin`, `tenant-member`) —
 * the real RBAC engine arrives in the platform-authorization epic
 * (ClickUp 869def338) and replaces both the group set and this store's
 * read paths without changing the contract.
 *
 * Invariants:
 * - One membership per `(userId, tenantId)`. A user has exactly one
 *   role in a given tenant.
 * - Adding the same pair twice throws. To change the group, use
 *   `setGroup`.
 * - `removeMembership` is idempotent.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { MembershipsStore } from '../memberships-store.js';

const t1 = 'tenant-a';
const t2 = 'tenant-b';

let docs: IDocumentDatabase;
let memberships: MembershipsStore;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  memberships = new MembershipsStore(docs);
});

describe('addMembership', () => {
  it('creates a (userId, tenantId, groupId) row', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    const [m] = await memberships.listByUser('u1');
    expect(m).toMatchObject({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
  });

  it('rejects a second membership for the same (userId, tenantId)', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-member' });
    await expect(
      memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' }),
    ).rejects.toThrow();
  });

  it('allows the same user in different tenants', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    await memberships.addMembership({ userId: 'u1', tenantId: t2, groupId: 'tenant-member' });
    const all = await memberships.listByUser('u1');
    expect(all).toHaveLength(2);
  });
});

describe('setGroup', () => {
  it('updates the groupId for an existing membership', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-member' });
    await memberships.setGroup('u1', t1, 'tenant-admin');
    const [m] = await memberships.listByUser('u1');
    expect(m?.groupId).toBe('tenant-admin');
  });

  it('throws when the membership does not exist (safer than silent no-op)', async () => {
    await expect(memberships.setGroup('u1', t1, 'tenant-admin')).rejects.toThrow();
  });
});

describe('listByUser / listByTenant', () => {
  it('listByUser returns all memberships for the user', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    await memberships.addMembership({ userId: 'u1', tenantId: t2, groupId: 'tenant-member' });
    await memberships.addMembership({ userId: 'u2', tenantId: t1, groupId: 'tenant-member' });
    const got = await memberships.listByUser('u1');
    expect(got).toHaveLength(2);
    expect(got.map(m => m.tenantId).sort()).toEqual([t1, t2].sort());
  });

  it('listByTenant returns all memberships for the tenant', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    await memberships.addMembership({ userId: 'u2', tenantId: t1, groupId: 'tenant-member' });
    await memberships.addMembership({ userId: 'u3', tenantId: t2, groupId: 'tenant-admin' });
    const got = await memberships.listByTenant(t1);
    expect(got).toHaveLength(2);
    expect(got.map(m => m.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('returns [] for unknown user / tenant', async () => {
    expect(await memberships.listByUser('u-nope')).toEqual([]);
    expect(await memberships.listByTenant('t-nope')).toEqual([]);
  });
});

describe('removeMembership', () => {
  it('removes one membership without touching others', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    await memberships.addMembership({ userId: 'u1', tenantId: t2, groupId: 'tenant-member' });
    await memberships.removeMembership('u1', t1);
    const got = await memberships.listByUser('u1');
    expect(got).toHaveLength(1);
    expect(got[0]?.tenantId).toBe(t2);
  });

  it('is idempotent for missing membership', async () => {
    await expect(memberships.removeMembership('u-nope', 't-nope')).resolves.not.toThrow();
  });
});

describe('removeAllForUser (cascade hook)', () => {
  it('removes all memberships for a userId', async () => {
    await memberships.addMembership({ userId: 'u1', tenantId: t1, groupId: 'tenant-admin' });
    await memberships.addMembership({ userId: 'u1', tenantId: t2, groupId: 'tenant-member' });
    await memberships.addMembership({ userId: 'u2', tenantId: t1, groupId: 'tenant-member' });
    await memberships.removeAllForUser('u1');
    expect(await memberships.listByUser('u1')).toEqual([]);
    expect(await memberships.listByUser('u2')).toHaveLength(1);
  });
});
