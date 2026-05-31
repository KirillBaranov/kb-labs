/**
 * @module @kb-labs/core-policy-runtime/collections
 *
 * Canonical collection names for the authorization data model. This is
 * the single source of truth shared by the engine's document-backed
 * readers (read path) and the gateway's seed stores (write path), so the
 * two never drift.
 *
 * `memberships` (single-group, ADR-0020) is intentionally NOT reused:
 * `ensureCollection` is additive-only and cannot drop its unique
 * `(userId, tenantId)` index. The richer model lives in a fresh
 * `policy_memberships` collection that allows multiple groups per user.
 */

export const POLICY_MEMBERSHIPS = 'policy_memberships';
export const POLICY_GROUPS = 'policy_groups';
export const POLICY_GROUP_PERMISSIONS = 'policy_group_permissions';
export const POLICY_RELATIONS = 'policy_relations';
