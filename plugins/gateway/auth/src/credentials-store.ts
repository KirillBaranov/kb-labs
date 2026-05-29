/**
 * @module @kb-labs/gateway-auth/credentials-store
 *
 * Document-backed store for per-provider credentials (ADR-0020, CD-6,
 * Phase 1.2).
 *
 * `User` does not carry a password hash. Credentials live here, keyed by
 * the compound `(userId, providerId)`. Adding a new identity provider
 * (Google, Okta, LDAP, ...) means writing a row with a new `providerId`
 * — no schema migration on the `users` collection, no `passwordHash?:
 * null` quirks.
 *
 * Hash format and algorithm are the provider's concern: this store only
 * persists opaque strings. The `email-password` provider chooses bcrypt
 * with a configured cost.
 */

import type {
  BaseDocument,
  IDocumentDatabase,
} from '@kb-labs/core-platform/adapters';

const COLLECTION = 'credentials';

export interface Credential {
  userId: string;
  providerId: string;
  /** Opaque to this store — bcrypt hash for email-password, OAuth refresh blob for future providers, etc. */
  hash: string;
  createdAt: number;
  updatedAt?: number;
}

interface CredentialDoc extends BaseDocument {
  userId: string;
  providerId: string;
  hash: string;
}

const docToCredential = (doc: CredentialDoc): Credential => ({
  userId: doc.userId,
  providerId: doc.providerId,
  hash: doc.hash,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export interface SetCredentialInput {
  userId: string;
  providerId: string;
  hash: string;
}

export class CredentialsStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(COLLECTION, {
          indexes: [
            // Logical primary key.
            { path: ['userId', 'providerId'], unique: true },
            // Cascade delete needs userId alone.
            { path: 'userId' },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async setCredential(input: SetCredentialInput): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateOne<CredentialDoc>(
      COLLECTION,
      {
        $and: [
          { userId: { $eq: input.userId } },
          { providerId: { $eq: input.providerId } },
        ],
      },
      {
        $set: {
          userId: input.userId,
          providerId: input.providerId,
          hash: input.hash,
        },
      },
      { upsert: true },
    );
  }

  async getCredential(userId: string, providerId: string): Promise<Credential | null> {
    await this.ensureSchema();
    const [doc] = await this.docs.find<CredentialDoc>(
      COLLECTION,
      {
        $and: [
          { userId: { $eq: userId } },
          { providerId: { $eq: providerId } },
        ],
      },
      { limit: 1 },
    );
    return doc ? docToCredential(doc) : null;
  }

  async deleteCredential(userId: string, providerId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<CredentialDoc>(COLLECTION, {
      $and: [
        { userId: { $eq: userId } },
        { providerId: { $eq: providerId } },
      ],
    });
  }

  /**
   * Cascade removal helper — call from the parent flow when a `User` is
   * deleted so we never leave dangling credentials in the store.
   */
  async deleteAllForUser(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<CredentialDoc>(COLLECTION, {
      userId: { $eq: userId },
    });
  }
}
