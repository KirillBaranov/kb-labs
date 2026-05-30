/**
 * @module @kb-labs/core-policy-runtime/rbac/inheritance
 *
 * Resolve the transitive group closure following `parents` edges.
 * In-memory over a pre-loaded group list (no N+1). Cycle-safe via a
 * visited set, so a misconfigured `A → B → A` graph terminates.
 */

import type { Group } from '../types.js';

export function resolveGroupClosure(
  directGroupIds: readonly string[],
  allGroups: readonly Group[],
): Set<string> {
  const byId = new Map<string, Group>();
  for (const g of allGroups) {
    byId.set(g.groupId, g);
  }

  const closure = new Set<string>();
  const stack: string[] = [...directGroupIds];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || closure.has(id)) {
      continue;
    }
    closure.add(id);
    const group = byId.get(id);
    if (group) {
      for (const parent of group.parents) {
        if (!closure.has(parent)) {
          stack.push(parent);
        }
      }
    }
  }

  return closure;
}
