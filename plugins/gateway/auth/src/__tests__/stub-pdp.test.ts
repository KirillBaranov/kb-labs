/**
 * Tests for the stub PDP (ADR-0020, Phase 1.12).
 *
 * Implements `IPolicyDecisionPoint` for this iteration. Two paths:
 *
 * - `check(identity, action)` consults the mock-RBAC map:
 *   tenant-admin → every PERMISSIONS value, tenant-member → none.
 *   Machine identities are temporarily allowed everything (this
 *   matches the existing machine-token behaviour and will tighten
 *   when the real PDP arrives in ClickUp 869def338).
 *
 * - `enumeratePermissions(identity)` returns the subset of canonical
 *   permissions the identity currently has. Used by GET /auth/permissions
 *   to seed Studio's `useCan(...)` map (CD-3).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import type { Identity } from '@kb-labs/core-contracts';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import { MembershipsStore } from '../memberships-store.js';
import { createStubPDP } from '../stub-pdp.js';

let memberships: MembershipsStore;

beforeEach(() => {
  const docs = createInMemoryDocumentDatabase();
  memberships = new MembershipsStore(docs);
});

const userId = 'u1';
const tenantId = 't1';
const userIdentity: Identity = { userId, tenantId, type: 'user' };
const machineIdentity: Identity = { userId: 'm1', tenantId, type: 'machine' };

describe('check', () => {
  it('denies anonymous (no membership in tenant)', async () => {
    const pdp = createStubPDP({ memberships });
    const r = await pdp.check(userIdentity, PERMISSIONS.USERS_WRITE);
    expect(r).toEqual({ allow: false, reason: 'no_membership' });
  });

  it('denies tenant-member on admin-actions', async () => {
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-member' });
    const pdp = createStubPDP({ memberships });
    expect(await pdp.check(userIdentity, PERMISSIONS.USERS_WRITE))
      .toMatchObject({ allow: false });
  });

  it('allows tenant-admin on admin-actions', async () => {
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-admin' });
    const pdp = createStubPDP({ memberships });
    expect(await pdp.check(userIdentity, PERMISSIONS.USERS_WRITE))
      .toEqual({ allow: true });
  });

  it('allows machine identities (machine-token compatibility for this iteration)', async () => {
    const pdp = createStubPDP({ memberships });
    expect(await pdp.check(machineIdentity, PERMISSIONS.MACHINE_REGISTER))
      .toEqual({ allow: true });
  });

  it('only consults membership in the identity\'s own tenant', async () => {
    // user is admin in t-other, member in t1
    await memberships.addMembership({ userId, tenantId: 't-other', groupId: 'tenant-admin' });
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-member' });
    const pdp = createStubPDP({ memberships });
    expect(await pdp.check(userIdentity, PERMISSIONS.USERS_WRITE))
      .toMatchObject({ allow: false });
  });

  it('denies unknown action even for tenant-admin (closed-world)', async () => {
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-admin' });
    const pdp = createStubPDP({ memberships });
    expect(await pdp.check(userIdentity, 'unknown:action'))
      .toMatchObject({ allow: false });
  });
});

describe('enumeratePermissions', () => {
  it('returns [] for anonymous (no membership)', async () => {
    const pdp = createStubPDP({ memberships });
    expect(await pdp.enumeratePermissions(userIdentity)).toEqual([]);
  });

  it('returns [] for tenant-member (all user-facing perms are admin-only for now)', async () => {
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-member' });
    const pdp = createStubPDP({ memberships });
    expect(await pdp.enumeratePermissions(userIdentity)).toEqual([]);
  });

  it('returns the full canonical set for tenant-admin', async () => {
    await memberships.addMembership({ userId, tenantId, groupId: 'tenant-admin' });
    const pdp = createStubPDP({ memberships });
    const got = await pdp.enumeratePermissions(userIdentity);
    expect(got.sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it('returns the machine-only subset for machine identities', async () => {
    const pdp = createStubPDP({ memberships });
    const got = await pdp.enumeratePermissions(machineIdentity);
    expect(got).toEqual([PERMISSIONS.MACHINE_REGISTER]);
  });
});
