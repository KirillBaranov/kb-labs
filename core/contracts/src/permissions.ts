/**
 * @module @kb-labs/core-contracts/permissions
 *
 * Canonical permission strings (ADR-0020, CD-7).
 *
 * Both the gateway (`requirePermission(...)`) and Studio (`useCan(...)`)
 * import from this single source of truth. Typos become compile errors
 * instead of silent denies.
 *
 * Permissions are kept stable: renaming a value is a breaking change
 * because it appears in tokens, audit logs, and admin UIs. Add new
 * permissions instead of repurposing existing ones.
 */

/**
 * Canonical permission strings used across the platform.
 *
 * Naming: `<resource>:<verb>`. `verb` is one of `read` | `write` | a
 * resource-specific action.
 */
export const PERMISSIONS = Object.freeze({
  /** Read users in your tenant (admin UI list view). */
  USERS_READ: 'users:read',
  /** Modify users in your tenant (enable/disable/role change). */
  USERS_WRITE: 'users:write',
  /** Read pending invites for your tenant. */
  INVITES_READ: 'invites:read',
  /** Create / revoke invites for your tenant. */
  INVITES_WRITE: 'invites:write',
  /** Register a new machine client (host). Replaces the old public `/auth/register`. */
  MACHINE_REGISTER: 'machine:register',
} as const);

/**
 * A canonical permission string.
 *
 * Use this anywhere you accept a permission value:
 *
 * ```ts
 * function requirePermission(p: Permission) { ... }
 * requirePermission(PERMISSIONS.USERS_WRITE); // ok
 * requirePermission('typo:write');            // compile error
 * ```
 */
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
