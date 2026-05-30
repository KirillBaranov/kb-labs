/**
 * @module @kb-labs/core-policy-runtime/rbac/engine
 *
 * RBAC resolution: user → (direct groups + inherited) → permissions.
 */

import type { IGroupReader } from '../ports.js';
import { resolveGroupClosure } from './inheritance.js';

export interface RbacEngine {
  /** Full resolved group closure (direct + inherited) for the user. */
  resolveGroupIds(tenantId: string, userId: string): Promise<string[]>;
  /** Union of permissions across the resolved group closure. */
  resolvePermissions(tenantId: string, userId: string): Promise<Set<string>>;
}

export function createRbacEngine(groups: IGroupReader): RbacEngine {
  async function resolveGroupIds(tenantId: string, userId: string): Promise<string[]> {
    const [direct, all] = await Promise.all([
      groups.listGroupIdsForUser(tenantId, userId),
      groups.listGroups(tenantId),
    ]);
    return [...resolveGroupClosure(direct, all)];
  }

  async function resolvePermissions(tenantId: string, userId: string): Promise<Set<string>> {
    const closure = await resolveGroupIds(tenantId, userId);
    if (closure.length === 0) {
      return new Set();
    }
    const perms = await groups.listPermissionsForGroups(tenantId, closure);
    return new Set(perms);
  }

  return { resolveGroupIds, resolvePermissions };
}
