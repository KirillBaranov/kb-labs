/**
 * @module @kb-labs/core-policy-runtime/readers/document-readers
 *
 * Generic `IDocumentDatabase`-backed implementations of the engine
 * reader ports. These are the READ path; the gateway owns the WRITE/seed
 * path. Both agree on schema via `../collections.js` + the doc shapes
 * here, so they never drift.
 *
 * All queries are scoped by `tenantId` (the subject's tenant — see
 * `Relation` contract).
 */

import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { ListResourcesOptions, Relation } from '@kb-labs/core-contracts';
import type { IGroupReader, IRelationReader } from '../ports.js';
import type { Group } from '../types.js';
import {
  POLICY_GROUPS,
  POLICY_GROUP_PERMISSIONS,
  POLICY_MEMBERSHIPS,
  POLICY_RELATIONS,
} from '../collections.js';

interface GroupDoc extends BaseDocument {
  groupId: string;
  tenantId: string;
  parents: string[];
}

interface GroupPermissionDoc extends BaseDocument {
  groupId: string;
  tenantId: string;
  permission: string;
}

interface MembershipDoc extends BaseDocument {
  userId: string;
  tenantId: string;
  groupId: string;
}

interface RelationDoc extends BaseDocument {
  tenantId: string;
  subjectUserId: string;
  relation: string;
  resourceType: string;
  resourceId: string;
}

const toRelation = (d: RelationDoc): Relation => ({
  tenantId: d.tenantId,
  subjectUserId: d.subjectUserId,
  relation: d.relation,
  resourceType: d.resourceType,
  resourceId: d.resourceId,
});

export class DocumentGroupReader implements IGroupReader {
  constructor(private readonly docs: IDocumentDatabase) {}

  async listGroups(tenantId: string): Promise<Group[]> {
    const rows = await this.docs.find<GroupDoc>(POLICY_GROUPS, {
      tenantId: { $eq: tenantId },
    });
    return rows.map((d) => ({
      groupId: d.groupId,
      tenantId: d.tenantId,
      parents: d.parents ?? [],
    }));
  }

  async listGroupIdsForUser(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.docs.find<MembershipDoc>(POLICY_MEMBERSHIPS, {
      $and: [{ userId: { $eq: userId } }, { tenantId: { $eq: tenantId } }],
    });
    return rows.map((d) => d.groupId);
  }

  async listPermissionsForGroups(tenantId: string, groupIds: string[]): Promise<string[]> {
    if (groupIds.length === 0) {
      return [];
    }
    const rows = await this.docs.find<GroupPermissionDoc>(POLICY_GROUP_PERMISSIONS, {
      $and: [{ tenantId: { $eq: tenantId } }, { groupId: { $in: groupIds } }],
    });
    const unique = new Set<string>();
    for (const r of rows) {
      unique.add(r.permission);
    }
    return [...unique];
  }
}

export class DocumentRelationReader implements IRelationReader {
  constructor(private readonly docs: IDocumentDatabase) {}

  async listRelations(
    tenantId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<Relation[]> {
    const rows = await this.docs.find<RelationDoc>(POLICY_RELATIONS, {
      $and: [
        { tenantId: { $eq: tenantId } },
        { subjectUserId: { $eq: userId } },
        { resourceType: { $eq: resourceType } },
        { resourceId: { $eq: resourceId } },
      ],
    });
    return rows.map(toRelation);
  }

  async listRelationsForType(
    tenantId: string,
    userId: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<Relation[]> {
    const rows = await this.docs.find<RelationDoc>(
      POLICY_RELATIONS,
      {
        $and: [
          { tenantId: { $eq: tenantId } },
          { subjectUserId: { $eq: userId } },
          { resourceType: { $eq: resourceType } },
        ],
      },
      opts?.limit !== undefined ? { limit: opts.limit } : undefined,
    );
    return rows.map(toRelation);
  }
}
