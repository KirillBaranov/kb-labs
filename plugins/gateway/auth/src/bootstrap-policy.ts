/**
 * @module @kb-labs/gateway-auth/bootstrap-policy
 *
 * First-run RBAC seed for the real Policy Decision Point (ClickUp 869def338).
 *
 * Preserves the behaviour the stub PDP hard-coded — `tenant-admin` gets every
 * canonical permission, `tenant-member` gets none — but now as DATA the real
 * engine reads. Idempotent: re-running grants/memberships that already exist
 * is a no-op, so admin re-grants survive restarts (we only seed, never reset).
 *
 * Decoupled from `ensureBootstrapAdmin`: the admin's `policy_memberships` row
 * is ensured by looking the user up, so an admin that already existed before
 * this store was introduced still gets seeded on the next start.
 */

import { PERMISSIONS } from '@kb-labs/core-contracts';
import type { GroupsStore } from './groups-store.js';
import type { GroupPermissionsStore } from './group-permissions-store.js';
import type { PolicyMembershipsStore } from './policy-memberships-store.js';
import type { UsersStore } from './users-store.js';

export const TENANT_ADMIN_GROUP = 'tenant-admin';
export const TENANT_MEMBER_GROUP = 'tenant-member';

export interface BootstrapPolicyLogger {
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

export interface EnsurePolicyBootstrapOptions {
  groups: GroupsStore;
  groupPermissions: GroupPermissionsStore;
  policyMemberships: PolicyMembershipsStore;
  users: UsersStore;
  tenantId: string;
  /** Bootstrap admin email — gets the `tenant-admin` policy membership. Optional. */
  adminEmail?: string;
  logger: BootstrapPolicyLogger;
}

/**
 * Seed the default groups, their permissions, and the bootstrap admin's
 * membership. Idempotent.
 */
export const ensurePolicyBootstrap = async (
  opts: EnsurePolicyBootstrapOptions,
): Promise<void> => {
  const { groups, groupPermissions, policyMemberships, users, tenantId, adminEmail, logger } = opts;

  // 1. Default groups (no inheritance).
  await groups.ensureGroup({ groupId: TENANT_ADMIN_GROUP, tenantId, parents: [] });
  await groups.ensureGroup({ groupId: TENANT_MEMBER_GROUP, tenantId, parents: [] });

  // 2. tenant-admin → every canonical platform permission. tenant-member → none.
  await groupPermissions.grantMany(TENANT_ADMIN_GROUP, tenantId, Object.values(PERMISSIONS));

  // 3. Bootstrap admin → tenant-admin membership (idempotent, decoupled from
  //    ensureBootstrapAdmin's early-return path).
  if (adminEmail) {
    const admin = await users.findByEmailTenant(adminEmail, tenantId);
    if (admin) {
      await policyMemberships.addGroup(admin.userId, tenantId, TENANT_ADMIN_GROUP);
      logger.info('bootstrap-policy: ensured tenant-admin membership', {
        userId: admin.userId,
        tenantId,
      });
    } else {
      // Fail-closed but easy to miss: the admin exists in config but not in the
      // store (e.g. ensureBootstrapAdmin was skipped because no password was set,
      // or it failed). The admin will hold NO permissions until granted.
      logger.warn(
        'bootstrap-policy: bootstrap admin not found — admin will have NO permissions until a tenant-admin membership is granted',
        { tenantId, adminEmail },
      );
    }
  }

  logger.info('bootstrap-policy: seeded default groups + permissions', { tenantId });
};
