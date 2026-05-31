/**
 * Tests for ensurePolicyBootstrap (ClickUp 869def338) — verifies the RBAC
 * seed produces the stub's former behaviour as DATA the real engine reads:
 * tenant-admin → every canonical permission, tenant-member → none.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { Identity } from '@kb-labs/core-contracts';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import { createDocumentBackedPolicy } from '@kb-labs/core-policy-runtime';
import { GroupsStore } from '../groups-store.js';
import { GroupPermissionsStore } from '../group-permissions-store.js';
import { PolicyMembershipsStore } from '../policy-memberships-store.js';
import { UsersStore } from '../users-store.js';
import { ensurePolicyBootstrap, TENANT_ADMIN_GROUP } from '../bootstrap-policy.js';

const TENANT = 'kblabs-cloud';
const ADMIN_EMAIL = 'admin@kblabs.test';
const silentLogger = { warn: () => {}, info: () => {} };

let docs: IDocumentDatabase;
let groups: GroupsStore;
let groupPermissions: GroupPermissionsStore;
let policyMemberships: PolicyMembershipsStore;
let users: UsersStore;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  groups = new GroupsStore(docs);
  groupPermissions = new GroupPermissionsStore(docs);
  policyMemberships = new PolicyMembershipsStore(docs);
  users = new UsersStore(docs);
});

const seed = (adminEmail?: string) =>
  ensurePolicyBootstrap({
    groups,
    groupPermissions,
    policyMemberships,
    users,
    tenantId: TENANT,
    adminEmail,
    logger: silentLogger,
  });

describe('ensurePolicyBootstrap', () => {
  it('grants the bootstrap admin every canonical permission via the real PDP', async () => {
    const admin: Identity = { userId: 'admin-1', tenantId: TENANT, type: 'user' };
    await users.create({ userId: admin.userId, tenantId: TENANT, email: ADMIN_EMAIL, status: 'active' });
    await seed(ADMIN_EMAIL);

    const pdp = createDocumentBackedPolicy(docs);
    for (const permission of Object.values(PERMISSIONS)) {
      expect(await pdp.check(admin, permission), `admin should hold ${permission}`).toEqual({
        allow: true,
      });
    }
  });

  it('denies a tenant-member every canonical permission', async () => {
    await seed(ADMIN_EMAIL);
    // A user explicitly placed in tenant-member.
    await policyMemberships.addGroup('member-1', TENANT, 'tenant-member');
    const member: Identity = { userId: 'member-1', tenantId: TENANT, type: 'user' };

    const pdp = createDocumentBackedPolicy(docs);
    for (const permission of Object.values(PERMISSIONS)) {
      expect((await pdp.check(member, permission)).allow, `member must not hold ${permission}`).toBe(
        false,
      );
    }
  });

  it('is idempotent — re-seeding does not duplicate grants or memberships', async () => {
    await users.create({ userId: 'admin-1', tenantId: TENANT, email: ADMIN_EMAIL, status: 'active' });
    await seed(ADMIN_EMAIL);
    await seed(ADMIN_EMAIL);

    expect((await groupPermissions.listByGroup(TENANT_ADMIN_GROUP, TENANT)).sort()).toEqual(
      Object.values(PERMISSIONS).sort(),
    );
    expect(await policyMemberships.listGroupsForUser('admin-1', TENANT)).toEqual([TENANT_ADMIN_GROUP]);
  });

  it('seeds groups even when the admin is absent (logs, no throw)', async () => {
    await expect(seed('missing@kblabs.test')).resolves.not.toThrow();
    expect((await groups.listGroups(TENANT)).map((g) => g.groupId).sort()).toEqual([
      'tenant-admin',
      'tenant-member',
    ]);
  });
});
