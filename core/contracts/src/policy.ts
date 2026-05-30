/**
 * @module @kb-labs/core-contracts/policy
 *
 * Policy Decision Point (ADR-0020, principle #4).
 *
 * Tokens carry identity, never permissions. Authorization decisions live
 * entirely behind this contract: every authenticated handler calls
 * `policy.check(identity, action, resource?, ctx?)` and trusts the
 * decision. The stub implementation that ships with this iteration uses
 * a hard-coded RBAC mapping; the real engine (RBAC + ReBAC, see
 * https://app.clickup.com/t/869def338) replaces the implementation
 * without touching this contract or any caller.
 *
 * `enumeratePermissions(identity)` exists so Studio can build
 * permission-aware UI (`useCan(...)`) without inferring the set from the
 * presence/absence of `check` calls. The stub returns the subset of
 * canonical permissions for which `check` would currently allow.
 */

import type { Permission } from './permissions.js';

/**
 * An authenticated caller. Subject ≠ identity: a `Subject` is built by
 * the policy layer at decision time from `{ user, memberships,
 * attributes }`. The token only carries enough to look the user up.
 *
 * Note the **absence** of `role`, `scopes`, `permissions`: those never
 * appear in tokens (ADR-0020, principle #3).
 */
export interface Identity {
  /** Internal stable user id (`users.userId`) for `type: 'user'`, or
   *  machine-client id for `type: 'machine'`. For `type: 'agent'` it is
   *  the delegating user's id (the agent acts on their behalf). */
  userId: string;
  /** Tenant the identity belongs to. Cross-tenant access is denied at
   *  the middleware layer before `check` is called. */
  tenantId: string;
  /**
   * `'agent'` is reserved for constrained-delegation tokens. The token
   * issuance + constraint intersection is a separate epic; until it
   * lands the PDP **fail-closes** on `type: 'agent'` (denies with
   * `reason: 'agent_delegation_not_implemented'`) so an agent identity
   * can never be silently treated as a full user.
   */
  type: 'user' | 'machine' | 'agent';
}

/**
 * The thing being acted upon. `type` is the resource kind (`'user'`,
 * `'invite'`, `'workflow'`, ...); `id`/`tenantId` are the specific
 * instance when known.
 *
 * Most permission checks are coarse (e.g. "can this identity write
 * users in their own tenant"). `resource` is optional so callers can
 * pass `undefined` for tenant-wide checks.
 */
export interface Resource {
  type: string;
  id?: string;
  tenantId?: string;
}

/**
 * A concrete resource reference returned by `listResources`. Unlike
 * `Resource` (where `id` is optional, for tenant-wide checks), a
 * `ResourceRef` always identifies a specific instance — it is something
 * the caller can render or navigate to.
 *
 * Carries `type` (not just bare ids) so a UI can group/route results,
 * and optional `tenantId` for cross-tenant aggregation surfaces. Making
 * this a named type now avoids a breaking `string[] → ResourceRef[]`
 * change once Studio builds permission-aware list views.
 */
export interface ResourceRef {
  type: string;
  id: string;
  tenantId?: string;
}

/**
 * A ReBAC relationship tuple: "`subjectUserId` is `relation` of
 * (`resourceType`, `resourceId`)" within `tenantId`.
 *
 * `tenantId` is ALWAYS the subject's (`identity.tenantId`) — never the
 * resource's optional `tenantId`. Cross-tenant access is denied at the
 * middleware before `check`, so relations are resolved strictly within
 * the caller's tenant.
 *
 * `relation` is an open string so plugins can define their own
 * relations (`owner`, `member`, `editor`, ...) without coupling to this
 * contract.
 */
export interface Relation {
  tenantId: string;
  subjectUserId: string;
  relation: string;
  resourceType: string;
  resourceId: string;
}

/**
 * The decision-time materialized view of a caller (ADR-0020 principle
 * #5: "Subject ≠ identity"). Built by the policy layer on every request
 * (resolved fresh — changing a user's group takes effect immediately).
 *
 * - `groupIds` — resolved group membership INCLUDING inherited groups.
 * - `relations` — ReBAC relations the subject holds.
 *
 * Attributes (for future ABAC) are intentionally absent — no dead
 * surface until a concrete attribute requirement exists.
 */
export interface Subject {
  identity: Identity;
  groupIds: string[];
  relations: Relation[];
}

/**
 * Pagination options for `listResources`. Defined now so adding paging
 * later is not a breaking signature change. `cursor` is opaque and
 * implementation-defined.
 */
export interface ListResourcesOptions {
  limit?: number;
  cursor?: string;
}

/**
 * Per-request attributes available to ABAC predicates in the future
 * (region, time, IP, etc.). Today the stub PDP ignores it; the contract
 * accepts it now so callers do not need to be retrofitted later.
 */
export type PolicyContext = Record<string, unknown>;

/**
 * Decision from the PDP. `reason` on deny is for logs and admin debug
 * surfaces — user-facing responses just say "forbidden".
 */
export type PolicyDecision =
  | { allow: true }
  | { allow: false; reason: string };

/**
 * The single authorization seam in the platform.
 */
export interface IPolicyDecisionPoint {
  /**
   * Decide whether `identity` may perform `action` on `resource` under
   * `ctx`. Must never throw on policy denial — throws are reserved for
   * infrastructure failures (store down, etc).
   *
   * `action` is a `Permission` value from the canonical enum, but typed
   * as `string` so future per-plugin permissions (e.g.
   * `plugin.foo.bar`) can flow without coupling to `core/contracts`.
   */
  check(
    identity: Identity,
    action: string,
    resource?: Resource,
    ctx?: PolicyContext,
  ): Promise<PolicyDecision>;

  /**
   * Return the set of permissions `identity` currently holds.
   *
   * Used by `GET /auth/permissions` to seed Studio's permission-aware
   * UI. Implementations should resolve the set from the same source as
   * `check`, so UI and backend decisions never disagree.
   *
   * Returned strings are canonical `Permission` values — the type is
   * `string[]` so future per-plugin permissions are not blocked by the
   * enum.
   */
  enumeratePermissions(identity: Identity): Promise<string[]>;

  /**
   * Return the specific resources of `resourceType` on which `identity`
   * may perform `action`. Powers permission-aware list views in Studio
   * (e.g. "the workflows you can open").
   *
   * Scope: this enumerates **ReBAC-scoped** access (resources reached
   * via a relation). Blanket RBAC access ("any member may view all
   * workflows") is NOT expanded here — that is signalled by
   * `enumeratePermissions` returning the action, and the UI combines
   * the two. Enumerating every resource for a blanket grant is the
   * owning service's concern, not the PDP's.
   */
  listResources(
    identity: Identity,
    action: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<ResourceRef[]>;
}

/**
 * Type-level reassurance that `Permission` is assignable where `action`
 * is expected. Re-exported here for callers that import the policy
 * contract by itself.
 */
export type { Permission };
