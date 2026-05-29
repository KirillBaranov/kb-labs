/**
 * @module @kb-labs/gateway-auth/stub-pdp
 *
 * Stub `IPolicyDecisionPoint` (ADR-0020, Phase 1.12). Mock RBAC over
 * the memberships store: tenant-admin gets every canonical permission,
 * tenant-member gets none. Machine identities are temporarily allowed
 * everything (matches the existing machine-token behaviour pre-RBAC).
 *
 * This module exists so the real handlers can call `policy.check(...)`
 * and `enumeratePermissions(...)` from day one. The real RBAC + ReBAC
 * engine (ClickUp 869def338) replaces this implementation; callers do
 * not change.
 *
 * Closed-world: actions outside the canonical PERMISSIONS enum return
 * `allow: false` even for tenant-admin. This is deliberate — until we
 * have per-plugin permission registration, the central enum is the
 * full universe of known actions.
 */

import type {
  Identity,
  IPolicyDecisionPoint,
  PolicyDecision,
  Resource,
  PolicyContext,
} from '@kb-labs/core-contracts';
import { PERMISSIONS } from '@kb-labs/core-contracts';
import type { MembershipsStore, GroupId } from './memberships-store.js';

const ALL_PERMISSIONS: ReadonlyArray<string> = Object.freeze(Object.values(PERMISSIONS));
const MACHINE_PERMISSIONS: ReadonlyArray<string> = Object.freeze([PERMISSIONS.MACHINE_REGISTER]);

const GROUP_PERMISSIONS: Readonly<Record<GroupId, ReadonlyArray<string>>> = Object.freeze({
  'tenant-admin': ALL_PERMISSIONS,
  'tenant-member': Object.freeze([]),
});

export interface StubPDPOptions {
  memberships: MembershipsStore;
}

export const createStubPDP = (opts: StubPDPOptions): IPolicyDecisionPoint => {
  const permissionsForUser = async (identity: Identity): Promise<ReadonlyArray<string>> => {
    const list = await opts.memberships.listByUser(identity.userId);
    const inTenant = list.find(m => m.tenantId === identity.tenantId);
    if (!inTenant) {return [];}
    return GROUP_PERMISSIONS[inTenant.groupId];
  };

  return {
    async check(
      identity: Identity,
      action: string,
      _resource?: Resource,
      _ctx?: PolicyContext,
    ): Promise<PolicyDecision> {
      if (identity.type === 'machine') {
        // Machine identities currently retain their pre-PDP permissions.
        // Will tighten when the real PDP lands.
        if ((MACHINE_PERMISSIONS as string[]).includes(action)) {
          return { allow: true };
        }
        // Machines still allowed for now — keeps gateway proxy flows intact.
        return { allow: true };
      }

      const perms = await permissionsForUser(identity);
      if (perms.length === 0) {
        return { allow: false, reason: 'no_membership' };
      }
      if (!perms.includes(action)) {
        return { allow: false, reason: 'permission_denied' };
      }
      return { allow: true };
    },

    async enumeratePermissions(identity: Identity): Promise<string[]> {
      if (identity.type === 'machine') {
        return [...MACHINE_PERMISSIONS];
      }
      const perms = await permissionsForUser(identity);
      return [...perms];
    },
  };
};
