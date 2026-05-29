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
   *  machine-client id for `type: 'machine'`. */
  userId: string;
  /** Tenant the identity belongs to. Cross-tenant access is denied at
   *  the middleware layer before `check` is called. */
  tenantId: string;
  type: 'user' | 'machine';
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
}

/**
 * Type-level reassurance that `Permission` is assignable where `action`
 * is expected. Re-exported here for callers that import the policy
 * contract by itself.
 */
export type { Permission };
