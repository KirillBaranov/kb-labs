/**
 * @module @kb-labs/gateway-auth/sessions-store
 *
 * Session families + refresh tokens (ADR-0020, Phase 1.5).
 *
 * This module owns three things:
 *
 * 1. **Session families.** One row per device. The family is the unit
 *    of revocation — "log out this device", "kick this user from all
 *    devices", "the password just changed, keep the current device".
 * 2. **Refresh tokens.** One-shot rotation: every refresh request
 *    consumes the old jti and issues a new one in the same family.
 * 3. **Reuse detection + 5-second grace window (CD-5).** Reusing an
 *    already-consumed refresh is either a stolen cookie or a legit
 *    multi-tab race. The grace window resolves the ambiguity: if the
 *    client presents the same already-consumed jti within 5s, we
 *    return the same replacement we issued first time. Beyond 5s, we
 *    treat it as theft and kill the entire family.
 *
 * Notes on storage:
 *
 * - Refresh tokens carry an explicit `expiresAt` and we check it
 *   manually on every read (CD-9) — the TTL index sweep is best-effort.
 * - `rotateRefresh` runs inside a `transaction(cb)` so a concurrent
 *   second caller sees the consumed state and goes through the
 *   grace/reuse branch instead of inserting a parallel replacement.
 */

import { randomBytes } from 'node:crypto';
import type {
  BaseDocument,
  IDocumentDatabase,
  IDocumentTransaction,
} from '@kb-labs/core-platform/adapters';

const FAMILIES = 'session_families';
const REFRESHES = 'refresh_tokens';

export interface SessionFamily {
  familyId: string;
  userId: string;
  tenantId: string;
  createdAt: number;
  lastUsedAt: number;
  userAgent?: string;
  ipFirst?: string;
}

interface FamilyDoc extends BaseDocument {
  familyId: string;
  userId: string;
  tenantId: string;
  createdAt: number;
  lastUsedAt: number;
  userAgent?: string;
  ipFirst?: string;
}

interface RefreshDoc extends BaseDocument {
  jti: string;
  familyId: string;
  userId: string;
  expiresAt: number;
  consumedAt?: number;
  replacedBy?: string;
}

export class RefreshNotFoundError extends Error {
  constructor() { super('refresh token not found'); this.name = 'RefreshNotFoundError'; }
}
export class RefreshExpiredError extends Error {
  constructor() { super('refresh token expired'); this.name = 'RefreshExpiredError'; }
}
export class RefreshReuseDetectedError extends Error {
  constructor(public readonly familyId: string) {
    super(`refresh token reuse detected (family ${familyId} killed)`);
    this.name = 'RefreshReuseDetectedError';
  }
}

export interface SessionsStoreOptions {
  /** Override `Date.now` — only used in tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Refresh token TTL in ms. */
  refreshTtlMs: number;
  /** Grace window for legitimate retries (CD-5). Recommended 5_000ms. */
  graceWindowMs: number;
}

export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  deviceCtx: { userAgent?: string; ip?: string };
}

export interface CreateSessionResult {
  familyId: string;
  refreshJti: string;
  refreshExpiresAt: number;
}

export interface RotateRefreshResult {
  newJti: string;
  familyId: string;
  newRefreshExpiresAt: number;
}

const newId = (bytes = 16): string => randomBytes(bytes).toString('base64url');

export class SessionsStore {
  private initialised: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly refreshTtlMs: number;
  private readonly graceWindowMs: number;

  constructor(
    private readonly docs: IDocumentDatabase,
    opts: SessionsStoreOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.refreshTtlMs = opts.refreshTtlMs;
    this.graceWindowMs = opts.graceWindowMs;
  }

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(FAMILIES, {
          indexes: [
            { path: 'familyId', unique: true },
            { path: 'userId' },
          ],
        });
        await this.docs.ensureCollection(REFRESHES, {
          indexes: [
            { path: 'jti', unique: true },
            { path: 'familyId' },
            { path: 'userId' },
            // Best-effort sweep; `rotateRefresh` checks expiresAt > now (CD-9).
            { path: 'expiresAt', ttl: 0 },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    await this.ensureSchema();
    const familyId = newId();
    const refreshJti = newId();
    const now = this.now();
    const refreshExpiresAt = now + this.refreshTtlMs;

    await this.docs.transaction(async (tx: IDocumentTransaction) => {
      await tx.insertOne<FamilyDoc>(FAMILIES, {
        familyId,
        userId: input.userId,
        tenantId: input.tenantId,
        createdAt: now,
        lastUsedAt: now,
        userAgent: input.deviceCtx.userAgent,
        ipFirst: input.deviceCtx.ip,
      });
      await tx.insertOne<RefreshDoc>(REFRESHES, {
        jti: refreshJti,
        familyId,
        userId: input.userId,
        expiresAt: refreshExpiresAt,
      });
    });

    return { familyId, refreshJti, refreshExpiresAt };
  }

  /**
   * Consume `oldJti` and issue a new refresh in the same family.
   *
   * Throws:
   * - `RefreshNotFoundError` if jti is unknown or its family was revoked.
   * - `RefreshExpiredError` if jti is past `expiresAt` (family stays alive).
   * - `RefreshReuseDetectedError` if jti was already consumed and the
   *   grace window has passed — family is killed before throwing.
   *
   * On grace-window retry (same already-consumed jti within
   * `graceWindowMs`) the previously-issued replacement is returned and
   * no new refresh is created.
   */
  async rotateRefresh(oldJti: string): Promise<RotateRefreshResult> {
    await this.ensureSchema();
    const now = this.now();
    const newJti = newId();
    const newExpiresAt = now + this.refreshTtlMs;

    // Outcome tag: lets us decide the side-effect AFTER the transaction.
    // We cannot throw `RefreshReuseDetectedError` from inside the
    // transaction callback — that rolls back the family deletion. So
    // reuse is detected inside (atomically, against a consistent
    // snapshot) and the family is killed outside.
    type Outcome =
      | { tag: 'ok'; result: RotateRefreshResult }
      | { tag: 'reuse'; familyId: string }
      | { tag: 'not-found' }
      | { tag: 'expired' };

    const outcome = await this.docs.transaction<Outcome>(async (tx) => {
      const [current] = await tx.find<RefreshDoc>(
        REFRESHES,
        { jti: { $eq: oldJti } },
        { limit: 1 },
      );
      if (!current) {return { tag: 'not-found' };}

      // Reuse / grace branch.
      if (current.consumedAt !== undefined) {
        const elapsed = now - current.consumedAt;
        if (elapsed <= this.graceWindowMs && current.replacedBy) {
          // Legitimate retry — return what we issued before.
          const [replacement] = await tx.find<RefreshDoc>(
            REFRESHES,
            { jti: { $eq: current.replacedBy } },
            { limit: 1 },
          );
          if (replacement) {
            return {
              tag: 'ok',
              result: {
                newJti: replacement.jti,
                familyId: current.familyId,
                newRefreshExpiresAt: replacement.expiresAt,
              },
            };
          }
          // Replacement vanished (family revoked between consume and retry).
          // Fall through to reuse detection.
        }
        // If the token is also past its expiry, it was legitimately rotated long ago —
        // treat as stale retry, not theft. Family stays alive.
        if (current.expiresAt <= now) {
          return { tag: 'expired' };
        }
        return { tag: 'reuse', familyId: current.familyId };
      }

      // Natural expiry — family is fine, this refresh just timed out.
      if (current.expiresAt <= now) {
        return { tag: 'expired' };
      }

      // Happy path — consume old, insert new, bump family lastUsedAt.
      await tx.updateMany<RefreshDoc>(
        REFRESHES,
        { jti: { $eq: oldJti } },
        { $set: { consumedAt: now, replacedBy: newJti } },
      );
      await tx.insertOne<RefreshDoc>(REFRESHES, {
        jti: newJti,
        familyId: current.familyId,
        userId: current.userId,
        expiresAt: newExpiresAt,
      });
      await tx.updateMany<FamilyDoc>(
        FAMILIES,
        { familyId: { $eq: current.familyId } },
        { $set: { lastUsedAt: now } },
      );

      return {
        tag: 'ok',
        result: { newJti, familyId: current.familyId, newRefreshExpiresAt: newExpiresAt },
      };
    });

    switch (outcome.tag) {
      case 'ok':
        return outcome.result;
      case 'not-found':
        throw new RefreshNotFoundError();
      case 'expired':
        throw new RefreshExpiredError();
      case 'reuse':
        // Kill the family — outside the read transaction so the writes commit.
        await this.revokeFamily(outcome.familyId);
        throw new RefreshReuseDetectedError(outcome.familyId);
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.transaction(async (tx) => {
      await tx.deleteMany<RefreshDoc>(REFRESHES, { familyId: { $eq: familyId } });
      await tx.deleteMany<FamilyDoc>(FAMILIES, { familyId: { $eq: familyId } });
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.transaction(async (tx) => {
      await tx.deleteMany<RefreshDoc>(REFRESHES, { userId: { $eq: userId } });
      await tx.deleteMany<FamilyDoc>(FAMILIES, { userId: { $eq: userId } });
    });
  }

  async revokeAllUserSessionsExcept(userId: string, exceptFamilyId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.transaction(async (tx) => {
      const families = await tx.find<FamilyDoc>(FAMILIES, { userId: { $eq: userId } });
      const targets = families.filter(f => f.familyId !== exceptFamilyId).map(f => f.familyId);
      if (targets.length === 0) {return;}
      await tx.deleteMany<RefreshDoc>(
        REFRESHES,
        { $and: [{ userId: { $eq: userId } }, { familyId: { $in: targets } }] },
      );
      await tx.deleteMany<FamilyDoc>(
        FAMILIES,
        { $and: [{ userId: { $eq: userId } }, { familyId: { $in: targets } }] },
      );
    });
  }

  async listFamiliesByUser(userId: string): Promise<SessionFamily[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<FamilyDoc>(
      FAMILIES,
      { userId: { $eq: userId } },
      { sort: { lastUsedAt: -1 } },
    );
    return docs.map(d => ({
      familyId: d.familyId,
      userId: d.userId,
      tenantId: d.tenantId,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
      userAgent: d.userAgent,
      ipFirst: d.ipFirst,
    }));
  }
}
