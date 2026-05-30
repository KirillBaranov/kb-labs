/**
 * @module @kb-labs/core-policy-runtime/rebac/engine
 *
 * ReBAC resolution: does the user hold a relation on this resource that
 * grants the action? Relations are always scoped to `identity.tenantId`
 * (never the resource's optional tenantId — cross-tenant is denied at
 * the middleware before `check`).
 */

import type {
  Identity,
  ListResourcesOptions,
  Resource,
  ResourceRef,
} from '@kb-labs/core-contracts';
import type { IRelationReader } from '../ports.js';
import type { RelationGrants } from '../types.js';

export interface RebacEngine {
  check(identity: Identity, action: string, resource: Resource): Promise<boolean>;
  listResources(
    identity: Identity,
    action: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<ResourceRef[]>;
}

export function createRebacEngine(
  relations: IRelationReader,
  grants: RelationGrants,
): RebacEngine {
  /** Relation names that grant `action` on `resourceType`. */
  function relationsGrantingAction(resourceType: string, action: string): Set<string> {
    const byRelation = grants[resourceType];
    const result = new Set<string>();
    if (!byRelation) {
      return result;
    }
    for (const [relation, permissions] of Object.entries(byRelation)) {
      if (permissions.includes(action)) {
        result.add(relation);
      }
    }
    return result;
  }

  async function check(identity: Identity, action: string, resource: Resource): Promise<boolean> {
    // ReBAC needs a concrete resource instance.
    if (!resource.id) {
      return false;
    }
    const granting = relationsGrantingAction(resource.type, action);
    if (granting.size === 0) {
      return false;
    }
    const held = await relations.listRelations(
      identity.tenantId,
      identity.userId,
      resource.type,
      resource.id,
    );
    return held.some((r) => granting.has(r.relation));
  }

  async function listResources(
    identity: Identity,
    action: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<ResourceRef[]> {
    const granting = relationsGrantingAction(resourceType, action);
    if (granting.size === 0) {
      return [];
    }
    const held = await relations.listRelationsForType(
      identity.tenantId,
      identity.userId,
      resourceType,
      opts,
    );
    const seen = new Set<string>();
    const refs: ResourceRef[] = [];
    for (const r of held) {
      if (granting.has(r.relation) && !seen.has(r.resourceId)) {
        seen.add(r.resourceId);
        refs.push({ type: r.resourceType, id: r.resourceId, tenantId: r.tenantId });
      }
    }
    return refs;
  }

  return { check, listResources };
}
