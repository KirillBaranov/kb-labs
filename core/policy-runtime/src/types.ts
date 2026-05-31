/**
 * @module @kb-labs/core-policy-runtime/types
 *
 * Engine-internal record types (persistence + config shapes). The
 * cross-cutting authorization vocabulary (`Identity`, `Resource`,
 * `Relation`, `Subject`, `ResourceRef`) lives in `@kb-labs/core-contracts`.
 */

/**
 * A group definition. `parents` are the groups this group inherits
 * permissions from (multi-parent; resolved transitively, cycle-safe).
 */
export interface Group {
  groupId: string;
  tenantId: string;
  parents: string[];
}

/** One permission granted to one group. */
export interface GroupPermission {
  groupId: string;
  tenantId: string;
  permission: string;
}

/** One (user → group) membership. Multiple per (userId, tenantId) allowed. */
export interface PolicyMembership {
  userId: string;
  tenantId: string;
  groupId: string;
}

/**
 * ReBAC grant configuration: which permissions each relation grants, per
 * resource type. Example:
 *
 * ```ts
 * { workflow: { owner: ['workflow:view', 'workflow:delete'], member: ['workflow:view'] } }
 * ```
 *
 * This is configuration (binding layer), not data — injected at engine
 * construction. Permission strings here are intentionally free-form
 * (plugin-defined permissions are not in the platform enum).
 */
export type RelationGrants = Record<string, Record<string, string[]>>;
