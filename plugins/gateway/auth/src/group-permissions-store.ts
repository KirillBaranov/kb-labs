/**
 * @module @kb-labs/gateway-auth/group-permissions-store
 *
 * WRITE/seed store for group → permission grants (`POLICY_GROUP_PERMISSIONS`).
 * The engine reads these via `DocumentGroupReader.listPermissionsForGroups`.
 */

import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { POLICY_GROUP_PERMISSIONS } from '@kb-labs/core-policy-runtime';

interface GroupPermissionDoc extends BaseDocument {
  groupId: string;
  tenantId: string;
  permission: string;
}

const eq = (groupId: string, tenantId: string, permission: string) => ({
  $and: [
    { groupId: { $eq: groupId } },
    { tenantId: { $eq: tenantId } },
    { permission: { $eq: permission } },
  ],
});

export class GroupPermissionsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(POLICY_GROUP_PERMISSIONS, {
          indexes: [
            { path: ['groupId', 'tenantId', 'permission'], unique: true },
            { path: ['groupId', 'tenantId'] },
          ],
        });
      })();
    }
    await this.initialised;
  }

  /** Grant a permission to a group. Idempotent. */
  async grant(groupId: string, tenantId: string, permission: string): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.docs.find<GroupPermissionDoc>(
      POLICY_GROUP_PERMISSIONS,
      eq(groupId, tenantId, permission),
      { limit: 1 },
    );
    if (existing) {
      return;
    }
    await this.docs.insertOne<GroupPermissionDoc>(POLICY_GROUP_PERMISSIONS, {
      groupId,
      tenantId,
      permission,
    });
  }

  /** Grant several permissions to a group. */
  async grantMany(groupId: string, tenantId: string, permissions: readonly string[]): Promise<void> {
    for (const permission of permissions) {
      await this.grant(groupId, tenantId, permission);
    }
  }

  /** Revoke a permission from a group. Idempotent. */
  async revoke(groupId: string, tenantId: string, permission: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<GroupPermissionDoc>(
      POLICY_GROUP_PERMISSIONS,
      eq(groupId, tenantId, permission),
    );
  }

  /** Permissions granted to a single group. */
  async listByGroup(groupId: string, tenantId: string): Promise<string[]> {
    await this.ensureSchema();
    const rows = await this.docs.find<GroupPermissionDoc>(POLICY_GROUP_PERMISSIONS, {
      $and: [{ groupId: { $eq: groupId } }, { tenantId: { $eq: tenantId } }],
    });
    return rows.map((d) => d.permission);
  }
}
