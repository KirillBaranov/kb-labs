/**
 * @module @kb-labs/gateway-auth/relations-store
 *
 * WRITE/seed store for ReBAC relation tuples (`POLICY_RELATIONS`). The
 * engine reads these via `DocumentRelationReader`.
 *
 * `tenantId` is ALWAYS the subject's tenant (`identity.tenantId`) — never
 * the resource's optional tenantId. In this iteration relations are
 * populated by seeds/tests only; plugin-driven population (`resources.track`)
 * arrives with plugin onboarding.
 */

import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { Relation } from '@kb-labs/core-contracts';
import { POLICY_RELATIONS } from '@kb-labs/core-policy-runtime';

interface RelationDoc extends BaseDocument {
  tenantId: string;
  subjectUserId: string;
  relation: string;
  resourceType: string;
  resourceId: string;
}

const eq = (r: Relation) => ({
  $and: [
    { tenantId: { $eq: r.tenantId } },
    { subjectUserId: { $eq: r.subjectUserId } },
    { relation: { $eq: r.relation } },
    { resourceType: { $eq: r.resourceType } },
    { resourceId: { $eq: r.resourceId } },
  ],
});

export class RelationsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(POLICY_RELATIONS, {
          indexes: [
            {
              path: ['tenantId', 'subjectUserId', 'relation', 'resourceType', 'resourceId'],
              unique: true,
            },
            { path: ['tenantId', 'subjectUserId', 'resourceType', 'resourceId'] },
            { path: ['tenantId', 'subjectUserId', 'resourceType'] },
          ],
        });
      })();
    }
    await this.initialised;
  }

  /** Record a relation. Idempotent. */
  async addRelation(relation: Relation): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.docs.find<RelationDoc>(POLICY_RELATIONS, eq(relation), { limit: 1 });
    if (existing) {
      return;
    }
    await this.docs.insertOne<RelationDoc>(POLICY_RELATIONS, {
      tenantId: relation.tenantId,
      subjectUserId: relation.subjectUserId,
      relation: relation.relation,
      resourceType: relation.resourceType,
      resourceId: relation.resourceId,
    });
  }

  /** Remove a relation. Idempotent. */
  async removeRelation(relation: Relation): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<RelationDoc>(POLICY_RELATIONS, eq(relation));
  }

  /** Remove every relation pointing at a resource — call when the resource is deleted. */
  async removeAllForResource(tenantId: string, resourceType: string, resourceId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<RelationDoc>(POLICY_RELATIONS, {
      $and: [
        { tenantId: { $eq: tenantId } },
        { resourceType: { $eq: resourceType } },
        { resourceId: { $eq: resourceId } },
      ],
    });
  }
}
