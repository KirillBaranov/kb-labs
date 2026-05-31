/**
 * @module @kb-labs/core-policy-runtime/pdp
 *
 * Combined Policy Decision Point: `allow = RBAC(action) OR ReBAC(action,
 * resource)`. Default deny (closed world). The Subject is resolved fresh
 * on every `check` (no cache) so a group/relation change takes effect
 * immediately (ADR-0020 principle #5); `deps.invalidate` is reserved as
 * the seam for a future cache without changing this signature.
 *
 * Identity type handling:
 * - `agent` → **fail-closed deny** until constrained delegation lands
 *   (ClickUp 869def338). An agent must never be silently treated as a
 *   full user.
 * - `machine` → bypasses RBAC/ReBAC; decided by injected `machinePolicy`
 *   (default: deny). The engine never hardcodes machine behaviour.
 * - `user` → RBAC OR ReBAC.
 *
 * No `action ∈ PERMISSIONS` guard: RBAC matches against group-permission
 * DATA, ReBAC against `relationGrants` CONFIG. Plugin-defined permission
 * strings (not in the platform enum) flow through unimpeded.
 */

import type {
  Identity,
  IPolicyDecisionPoint,
  ListResourcesOptions,
  PolicyContext,
  PolicyDecision,
  Resource,
  ResourceRef,
} from '@kb-labs/core-contracts';
import type { IGroupReader, IRelationReader } from './ports.js';
import type { RelationGrants } from './types.js';
import { createRbacEngine } from './rbac/engine.js';
import { createRebacEngine } from './rebac/engine.js';

export interface PolicyEngineDeps {
  groups: IGroupReader;
  relations: IRelationReader;
  /** resourceType → relation → permissions granted. Defaults to none. */
  relationGrants?: RelationGrants;
  /**
   * Decide machine-identity actions. Machines bypass RBAC/ReBAC.
   * Default: deny everything (safe closed-world). Hosts that need the
   * legacy "machines allowed" behaviour inject `() => true`.
   */
  machinePolicy?: (action: string) => boolean;
  /**
   * Cache-invalidation seam for a future caching layer. The no-cache
   * engine ignores it; reserved so adding a cache later is not a
   * breaking change to construction.
   */
  invalidate?: (userId?: string) => void;
}

export const AGENT_DENY_REASON = 'agent_delegation_not_implemented';

export function createPolicyDecisionPoint(deps: PolicyEngineDeps): IPolicyDecisionPoint {
  const rbac = createRbacEngine(deps.groups);
  const rebac = createRebacEngine(deps.relations, deps.relationGrants ?? {});
  const machinePolicy = deps.machinePolicy ?? (() => false);

  return {
    async check(
      identity: Identity,
      action: string,
      resource?: Resource,
      _ctx?: PolicyContext,
    ): Promise<PolicyDecision> {
      if (identity.type === 'agent') {
        return { allow: false, reason: AGENT_DENY_REASON };
      }

      if (identity.type === 'machine') {
        return machinePolicy(action)
          ? { allow: true }
          : { allow: false, reason: 'machine_denied' };
      }

      // user: RBAC OR ReBAC, default deny.
      const perms = await rbac.resolvePermissions(identity.tenantId, identity.userId);

      if (perms.has(action)) {
        return { allow: true };
      }
      if (resource && (await rebac.check(identity, action, resource))) {
        return { allow: true };
      }
      if (perms.size === 0) {
        return { allow: false, reason: 'no_membership' };
      }
      return { allow: false, reason: 'permission_denied' };
    },

    async enumeratePermissions(identity: Identity): Promise<string[]> {
      if (identity.type === 'agent' || identity.type === 'machine') {
        // Agents fail-closed; machine permissions are opaque to the
        // group model (decided by machinePolicy, not enumerable).
        return [];
      }
      const perms = await rbac.resolvePermissions(identity.tenantId, identity.userId);
      return [...perms];
    },

    async listResources(
      identity: Identity,
      action: string,
      resourceType: string,
      opts?: ListResourcesOptions,
    ): Promise<ResourceRef[]> {
      // Only `user` identities resolve ReBAC-scoped resources. Agents fail
      // closed; machines bypass RBAC/ReBAC entirely (decided by machinePolicy,
      // which is action-level and has no resource enumeration).
      if (identity.type !== 'user') {
        return [];
      }
      return rebac.listResources(identity, action, resourceType, opts);
    },
  };
}
