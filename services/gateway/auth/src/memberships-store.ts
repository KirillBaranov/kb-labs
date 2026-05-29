/**
 * @module @kb-labs/gateway-auth/memberships-store
 *
 * Document-backed store for `Membership` records (ADR-0020, Phase 1.3).
 *
 * A membership is one row per `(userId, tenantId)` with a single
 * `groupId`. Group strings are hardcoded for this iteration —
 * `tenant-admin` and `tenant-member` — and consumed by the stub PDP.
 *
 * When the real RBAC + ReBAC engine lands (ClickUp 869def338) the
 * meaning of `groupId` becomes richer (multiple group memberships,
 * group hierarchies, relations) but the store API stays — the engine
 * sits behind the PDP and reads from here. The "one membership per
 * (userId, tenantId)" invariant may need to flex later; for now we keep
 * it tight so the stub PDP has unambiguous lookups.
 */

import type {
  BaseDocument,
  IDocumentDatabase,
} from '@kb-labs/core-platform/adapters';

const COLLECTION = 'memberships';

/** Hardcoded group ids for the stub PDP iteration. */
export type GroupId = 'tenant-admin' | 'tenant-member';

export interface Membership {
  userId: string;
  tenantId: string;
  groupId: GroupId;
  createdAt: number;
  updatedAt?: number;
}

interface MembershipDoc extends BaseDocument {
  userId: string;
  tenantId: string;
  groupId: GroupId;
}

const docToMembership = (doc: MembershipDoc): Membership => ({
  userId: doc.userId,
  tenantId: doc.tenantId,
  groupId: doc.groupId,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export interface AddMembershipInput {
  userId: string;
  tenantId: string;
  groupId: GroupId;
}

export class MembershipsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(COLLECTION, {
          indexes: [
            { path: ['userId', 'tenantId'], unique: true },
            { path: 'userId' },
            { path: 'tenantId' },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async addMembership(input: AddMembershipInput): Promise<void> {
    await this.ensureSchema();
    await this.docs.insertOne<MembershipDoc>(COLLECTION, {
      userId: input.userId,
      tenantId: input.tenantId,
      groupId: input.groupId,
    });
  }

  async setGroup(userId: string, tenantId: string, groupId: GroupId): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.docs.find<MembershipDoc>(
      COLLECTION,
      { $and: [{ userId: { $eq: userId } }, { tenantId: { $eq: tenantId } }] },
      { limit: 1 },
    );
    if (!existing) {
      throw new Error(
        `memberships-store: setGroup on missing membership userId=${userId} tenantId=${tenantId}`,
      );
    }
    await this.docs.updateMany<MembershipDoc>(
      COLLECTION,
      { $and: [{ userId: { $eq: userId } }, { tenantId: { $eq: tenantId } }] },
      { $set: { groupId } },
    );
  }

  async listByUser(userId: string): Promise<Membership[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<MembershipDoc>(
      COLLECTION,
      { userId: { $eq: userId } },
      { sort: { tenantId: 1 } },
    );
    return docs.map(docToMembership);
  }

  async listByTenant(tenantId: string): Promise<Membership[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<MembershipDoc>(
      COLLECTION,
      { tenantId: { $eq: tenantId } },
      { sort: { userId: 1 } },
    );
    return docs.map(docToMembership);
  }

  async removeMembership(userId: string, tenantId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<MembershipDoc>(
      COLLECTION,
      { $and: [{ userId: { $eq: userId } }, { tenantId: { $eq: tenantId } }] },
    );
  }

  /** Cascade hook — call when a `User` is deleted. */
  async removeAllForUser(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<MembershipDoc>(COLLECTION, { userId: { $eq: userId } });
  }
}
