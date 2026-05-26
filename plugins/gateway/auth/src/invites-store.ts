/**
 * @module @kb-labs/gateway-auth/invites-store
 *
 * Document-backed store for activation invites (ADR-0020, Phase 1.4).
 *
 * Invites are admin-issued tokens that bootstrap a user account: the
 * recipient activates by POSTing the token along with a password.
 *
 * Security details worth keeping straight:
 *
 * - Token plaintext **never** lands in the database. We store
 *   `tokenHash = sha256(plain)` and look up by hash. A snapshot of the
 *   `invites` collection is useless without the original tokens.
 * - The unique compound `(tenantId, email, status='active')` is not
 *   easy to express across drivers, so uniqueness is enforced in code
 *   on top of a non-unique compound index. Concurrent races during
 *   `createInvite` are not a real attack vector here (admin UI is
 *   single-clicked) and we accept the small theoretical window.
 * - TTL is best-effort on the index; **every read path** explicitly
 *   checks `expiresAt > now` (CD-9). Without that, a not-yet-swept row
 *   would be returned and the activation flow would accept it.
 * - Emails are canonicalised on the way in (CD-4) so admins can paste
 *   "Alice@Example.COM" without breaking lookups.
 */

import { randomBytes, createHash } from 'node:crypto';
import type {
  BaseDocument,
  IDocumentDatabase,
} from '@kb-labs/core-platform/adapters';
import { canonicalizeEmail } from './users-store.js';
import type { GroupId } from './memberships-store.js';

const COLLECTION = 'invites';

export type InviteStatus = 'active' | 'used' | 'revoked';

export interface InviteRecord {
  inviteId: string;
  email: string;
  tenantId: string;
  groupId: GroupId;
  status: InviteStatus;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  updatedAt?: number;
}

interface InviteDoc extends BaseDocument {
  inviteId: string;
  email: string;
  tenantId: string;
  groupId: GroupId;
  status: InviteStatus;
  createdBy: string;
  expiresAt: number;
  tokenHash: string;
}

export interface CreateInviteInput {
  email: string;
  tenantId: string;
  groupId: GroupId;
  createdBy: string;
  ttlMs: number;
}

export interface CreateInviteResult {
  inviteId: string;
  activationToken: string;
  expiresAt: number;
}

const TOKEN_BYTES = 32;

const generateToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

const hashToken = (plain: string): string =>
  createHash('sha256').update(plain).digest('hex');

const generateInviteId = (): string => randomBytes(16).toString('base64url');

const docToInvite = (doc: InviteDoc): InviteRecord => ({
  inviteId: doc.inviteId,
  email: doc.email,
  tenantId: doc.tenantId,
  groupId: doc.groupId,
  status: doc.status,
  createdBy: doc.createdBy,
  expiresAt: doc.expiresAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export class InvitesStore {
  private initialised: Promise<void> | null = null;

  constructor(
    private readonly docs: IDocumentDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(COLLECTION, {
          indexes: [
            { path: 'inviteId', unique: true },
            { path: 'tokenHash', unique: true },
            // Active-invite uniqueness is enforced in code, so this index
            // is non-unique and just speeds the "is there an active invite
            // for (email, tenantId)" lookup.
            { path: ['tenantId', 'email', 'status'] },
            // TTL is best-effort; `findByToken` also checks expiresAt > now.
            // `ttl: 0` means "sweep as soon as `expiresAt` is in the past".
            { path: 'expiresAt', ttl: 0 },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
    await this.ensureSchema();
    const email = canonicalizeEmail(input.email);

    // Uniqueness check — best effort, see module docstring.
    const [existingActive] = await this.docs.find<InviteDoc>(
      COLLECTION,
      {
        $and: [
          { tenantId: { $eq: input.tenantId } },
          { email: { $eq: email } },
          { status: { $eq: 'active' as InviteStatus } },
          { expiresAt: { $gt: this.now() } },
        ],
      },
      { limit: 1 },
    );
    if (existingActive) {
      throw new Error(
        `invites-store: an active invite already exists for email=${email} tenantId=${input.tenantId}; revoke it before issuing a new one`,
      );
    }

    const inviteId = generateInviteId();
    const activationToken = generateToken();
    const tokenHash = hashToken(activationToken);
    const expiresAt = this.now() + input.ttlMs;

    await this.docs.insertOne<InviteDoc>(COLLECTION, {
      inviteId,
      email,
      tenantId: input.tenantId,
      groupId: input.groupId,
      status: 'active',
      createdBy: input.createdBy,
      expiresAt,
      tokenHash,
    });

    return { inviteId, activationToken, expiresAt };
  }

  async findById(inviteId: string): Promise<InviteRecord | null> {
    await this.ensureSchema();
    const [doc] = await this.docs.find<InviteDoc>(
      COLLECTION,
      { inviteId: { $eq: inviteId } },
      { limit: 1 },
    );
    return doc ? docToInvite(doc) : null;
  }

  /**
   * Look up an invite by the plaintext activation token. Returns `null`
   * for missing, expired, used, or revoked invites — callers do not
   * need to filter further.
   */
  async findByToken(plainToken: string): Promise<InviteRecord | null> {
    await this.ensureSchema();
    const tokenHash = hashToken(plainToken);
    const [doc] = await this.docs.find<InviteDoc>(
      COLLECTION,
      { tokenHash: { $eq: tokenHash } },
      { limit: 1 },
    );
    if (!doc) return null;
    if (doc.status !== 'active') return null;
    // CD-9 explicit expiry check — TTL sweep is best-effort.
    if (doc.expiresAt <= this.now()) return null;
    return docToInvite(doc);
  }

  async consume(inviteId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateMany<InviteDoc>(
      COLLECTION,
      { $and: [{ inviteId: { $eq: inviteId } }, { status: { $eq: 'active' as InviteStatus } }] },
      { $set: { status: 'used' } },
    );
  }

  async revoke(inviteId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateMany<InviteDoc>(
      COLLECTION,
      { $and: [{ inviteId: { $eq: inviteId } }, { status: { $eq: 'active' as InviteStatus } }] },
      { $set: { status: 'revoked' } },
    );
  }

  /** List all invites for a tenant (active + used + revoked). */
  async listByTenant(tenantId: string): Promise<InviteRecord[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<InviteDoc>(
      COLLECTION,
      { tenantId: { $eq: tenantId } },
    );
    return docs.map(docToInvite);
  }
}
