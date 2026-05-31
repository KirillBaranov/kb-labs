/**
 * In-memory fake reader ports for engine unit tests (no DB).
 */

import type { ListResourcesOptions, Relation } from '@kb-labs/core-contracts';
import type { IGroupReader, IRelationReader } from '../ports.js';
import type { Group } from '../types.js';

export class FakeGroupReader implements IGroupReader {
  /** Counts `listGroups` calls — asserts no N+1 in inheritance resolution. */
  listGroupsCalls = 0;

  constructor(
    private readonly groupsByTenant: Record<string, Group[]> = {},
    /** key: `${tenantId}:${userId}` → direct group ids */
    private readonly membershipsByUser: Record<string, string[]> = {},
    /** key: `${tenantId}:${groupId}` → permissions */
    private readonly permsByGroup: Record<string, string[]> = {},
  ) {}

  async listGroups(tenantId: string): Promise<Group[]> {
    this.listGroupsCalls += 1;
    return this.groupsByTenant[tenantId] ?? [];
  }

  async listGroupIdsForUser(tenantId: string, userId: string): Promise<string[]> {
    return this.membershipsByUser[`${tenantId}:${userId}`] ?? [];
  }

  async listPermissionsForGroups(tenantId: string, groupIds: string[]): Promise<string[]> {
    const out = new Set<string>();
    for (const g of groupIds) {
      for (const p of this.permsByGroup[`${tenantId}:${g}`] ?? []) {
        out.add(p);
      }
    }
    return [...out];
  }
}

export class FakeRelationReader implements IRelationReader {
  constructor(private readonly relations: Relation[] = []) {}

  async listRelations(
    tenantId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<Relation[]> {
    return this.relations.filter(
      (r) =>
        r.tenantId === tenantId &&
        r.subjectUserId === userId &&
        r.resourceType === resourceType &&
        r.resourceId === resourceId,
    );
  }

  async listRelationsForType(
    tenantId: string,
    userId: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<Relation[]> {
    const matched = this.relations.filter(
      (r) =>
        r.tenantId === tenantId &&
        r.subjectUserId === userId &&
        r.resourceType === resourceType,
    );
    return opts?.limit !== undefined ? matched.slice(0, opts.limit) : matched;
  }
}
