/**
 * @module @kb-labs/gateway-auth/policy-memberships-store
 *
 * Document-backed WRITE/seed store for RBAC memberships used by the real
 * policy engine (ClickUp 869def338). The READ path lives in
 * `@kb-labs/core-policy-runtime` (`DocumentGroupReader`); both share the
 * `POLICY_MEMBERSHIPS` collection + doc shape so they never drift.
 *
 * Distinct from the ADR-0020 `memberships` store (single group per
 * `(userId, tenantId)`, unique-indexed). `ensureCollection` is
 * additive-only and cannot drop that unique index, so the richer
 * multi-group model gets its own collection rather than mutating the
 * legacy one.
 */

import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { POLICY_MEMBERSHIPS } from '@kb-labs/core-policy-runtime';

interface MembershipDoc extends BaseDocument {
  userId: string;
  tenantId: string;
  groupId: string;
}

const eq = (userId: string, tenantId: string, groupId: string) => ({
  $and: [
    { userId: { $eq: userId } },
    { tenantId: { $eq: tenantId } },
    { groupId: { $eq: groupId } },
  ],
});

export class PolicyMembershipsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(POLICY_MEMBERSHIPS, {
          indexes: [
            { path: ['userId', 'tenantId', 'groupId'], unique: true },
            { path: ['userId', 'tenantId'] },
            { path: 'tenantId' },
          ],
        });
      })();
    }
    await this.initialised;
  }

  /** Add a user to a group. Idempotent — re-adding the same triple is a no-op. */
  async addGroup(userId: string, tenantId: string, groupId: string): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.docs.find<MembershipDoc>(
      POLICY_MEMBERSHIPS,
      eq(userId, tenantId, groupId),
      { limit: 1 },
    );
    if (existing) {
      return;
    }
    await this.docs.insertOne<MembershipDoc>(POLICY_MEMBERSHIPS, { userId, tenantId, groupId });
  }

  /** Remove a user from a group. Idempotent. */
  async removeGroup(userId: string, tenantId: string, groupId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<MembershipDoc>(POLICY_MEMBERSHIPS, eq(userId, tenantId, groupId));
  }

  /** Group ids the user is a direct member of in the tenant. */
  async listGroupsForUser(userId: string, tenantId: string): Promise<string[]> {
    await this.ensureSchema();
    const rows = await this.docs.find<MembershipDoc>(POLICY_MEMBERSHIPS, {
      $and: [{ userId: { $eq: userId } }, { tenantId: { $eq: tenantId } }],
    });
    return rows.map((d) => d.groupId);
  }

  /** Cascade hook — call when a `User` is deleted. */
  async removeAllForUser(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<MembershipDoc>(POLICY_MEMBERSHIPS, { userId: { $eq: userId } });
  }
}
