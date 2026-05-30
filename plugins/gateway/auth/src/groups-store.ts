/**
 * @module @kb-labs/gateway-auth/groups-store
 *
 * WRITE/seed store for RBAC group definitions (`POLICY_GROUPS`). `parents`
 * drives inheritance, resolved in the engine (`@kb-labs/core-policy-runtime`).
 */

import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { Group } from '@kb-labs/core-policy-runtime';
import { POLICY_GROUPS } from '@kb-labs/core-policy-runtime';

interface GroupDoc extends BaseDocument {
  groupId: string;
  tenantId: string;
  parents: string[];
}

const byId = (groupId: string, tenantId: string) => ({
  $and: [{ groupId: { $eq: groupId } }, { tenantId: { $eq: tenantId } }],
});

export class GroupsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(POLICY_GROUPS, {
          indexes: [{ path: ['groupId', 'tenantId'], unique: true }, { path: 'tenantId' }],
        });
      })();
    }
    await this.initialised;
  }

  /** Create the group if absent, otherwise update its parents. Idempotent. */
  async ensureGroup(group: Group): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.docs.find<GroupDoc>(POLICY_GROUPS, byId(group.groupId, group.tenantId), {
      limit: 1,
    });
    if (!existing) {
      await this.docs.insertOne<GroupDoc>(POLICY_GROUPS, {
        groupId: group.groupId,
        tenantId: group.tenantId,
        parents: group.parents,
      });
      return;
    }
    await this.docs.updateMany<GroupDoc>(POLICY_GROUPS, byId(group.groupId, group.tenantId), {
      $set: { parents: group.parents },
    });
  }

  async getGroup(groupId: string, tenantId: string): Promise<Group | null> {
    await this.ensureSchema();
    const [doc] = await this.docs.find<GroupDoc>(POLICY_GROUPS, byId(groupId, tenantId), { limit: 1 });
    if (!doc) {
      return null;
    }
    return { groupId: doc.groupId, tenantId: doc.tenantId, parents: doc.parents ?? [] };
  }

  async listGroups(tenantId: string): Promise<Group[]> {
    await this.ensureSchema();
    const rows = await this.docs.find<GroupDoc>(POLICY_GROUPS, { tenantId: { $eq: tenantId } });
    return rows.map((d) => ({ groupId: d.groupId, tenantId: d.tenantId, parents: d.parents ?? [] }));
  }
}
