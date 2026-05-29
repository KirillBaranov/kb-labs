/**
 * @module @kb-labs/gateway-auth/users-store
 *
 * Document-backed store for `User` records (ADR-0020, Phase 1.1).
 *
 * Schema invariants:
 * - `(tenantId, email)` is a unique compound — one user per email per
 *   tenant. The same email can exist in different tenants.
 * - `email` is **always** stored lowercased + trimmed (CD-4). Callers
 *   may pass any casing; the store normalises before write/read.
 * - **No** password hash on this document. Credentials live in the
 *   separate `credentials` collection (CD-6) so a future Google/Okta
 *   provider can attach to the same `User` without a schema migration.
 *
 * Pattern follows `plugins/gateway/core/src/stores/host-store.ts`:
 * one-shot `ensureSchema()` plus per-method idempotent `ensureCollection`
 * registration.
 */

import type {
  BaseDocument,
  IDocumentDatabase,
} from '@kb-labs/core-platform/adapters';

const COLLECTION = 'users';

export type UserStatus = 'pending' | 'active' | 'disabled';

export interface User {
  userId: string;
  tenantId: string;
  /** Lowercase + trimmed (CD-4). */
  email: string;
  displayName?: string;
  status: UserStatus;
  createdAt: number;
  updatedAt?: number;
}

interface UserDoc extends BaseDocument {
  userId: string;
  tenantId: string;
  /** Always lowercase + trimmed; used by the unique index. */
  email: string;
  displayName?: string;
  status: UserStatus;
}

/**
 * Canonical email form used everywhere this store touches.
 *
 * Exported so other modules (the email-password provider, invites-store)
 * normalise identically — having one function prevents drift where one
 * caller forgets to trim and lookups silently miss.
 */
export const canonicalizeEmail = (raw: string): string => raw.trim().toLowerCase();

const docToUser = (doc: UserDoc): User => ({
  userId: doc.userId,
  tenantId: doc.tenantId,
  email: doc.email,
  displayName: doc.displayName,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export interface CreateUserInput {
  userId: string;
  tenantId: string;
  email: string;
  status: UserStatus;
  displayName?: string;
}

export class UsersStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(COLLECTION, {
          indexes: [
            // Logical primary key for "user inside tenant" lookups.
            { path: ['tenantId', 'email'], unique: true },
            // userId is the surrogate key callers reference everywhere.
            { path: 'userId', unique: true },
            { path: 'tenantId' },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async create(input: CreateUserInput): Promise<User> {
    await this.ensureSchema();
    const email = canonicalizeEmail(input.email);
    // The unique compound index turns a race-y duplicate into a driver-level
    // throw; we don't need an additional pre-check.
    await this.docs.insertOne<UserDoc>(COLLECTION, {
      userId: input.userId,
      tenantId: input.tenantId,
      email,
      displayName: input.displayName,
      status: input.status,
    });
    const created = await this.getById(input.userId);
    if (!created) {
      // Shouldn't happen — insertOne just succeeded. Defensive throw makes
      // a corrupted-index situation visible immediately rather than at the
      // next read.
      throw new Error(`users-store: inserted user ${input.userId} but read-back returned null`);
    }
    return created;
  }

  async getById(userId: string): Promise<User | null> {
    await this.ensureSchema();
    const doc = await this.docs.findById<UserDoc>(COLLECTION, userId);
    if (doc && doc.userId === userId) {
      return docToUser(doc);
    }
    // findById uses the driver's id field; we also keep `userId` explicitly
    // so the store works even when the driver-id differs from userId.
    const [byField] = await this.docs.find<UserDoc>(
      COLLECTION,
      { userId: { $eq: userId } },
      { limit: 1 },
    );
    return byField ? docToUser(byField) : null;
  }

  async findByEmailTenant(email: string, tenantId: string): Promise<User | null> {
    await this.ensureSchema();
    const normalised = canonicalizeEmail(email);
    const [doc] = await this.docs.find<UserDoc>(
      COLLECTION,
      { $and: [{ tenantId: { $eq: tenantId } }, { email: { $eq: normalised } }] },
      { limit: 1 },
    );
    return doc ? docToUser(doc) : null;
  }

  async setStatus(userId: string, status: UserStatus): Promise<void> {
    await this.ensureSchema();
    const existing = await this.getById(userId);
    if (!existing) {
      throw new Error(`users-store: setStatus on unknown userId=${userId}`);
    }
    await this.docs.updateMany<UserDoc>(
      COLLECTION,
      { userId: { $eq: userId } },
      { $set: { status } },
    );
  }

  /** List all users for a given tenant. */
  async listByTenant(tenantId: string): Promise<User[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<UserDoc>(
      COLLECTION,
      { tenantId: { $eq: tenantId } },
    );
    return docs.map(docToUser);
  }

  async delete(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<UserDoc>(COLLECTION, { userId: { $eq: userId } });
  }
}
