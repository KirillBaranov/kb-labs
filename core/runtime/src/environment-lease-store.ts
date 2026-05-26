/**
 * @module @kb-labs/core-runtime/environment-lease-store
 *
 * Persistence for environment leases and their lifecycle events.
 *
 * Backed by `IDocumentDatabase` — the same abstraction every other
 * platform component uses, so the store rides whichever driver the
 * deployment wired up (sqlite for solo, postgres/mongo for team).
 *
 * Collections:
 * - `environment_leases` — one document per environment. The
 *   `environmentId` field is the logical primary key (unique index).
 * - `environment_events` — append-only event log; events carry their
 *   own deterministic id from the caller.
 *
 * The store accepts/returns the same row shapes as the previous SQL
 * implementation so callers (run executor, environment manager) don't
 * need to change.
 */

import type {
  IDocumentDatabase,
  BaseDocument,
} from '@kb-labs/core-platform/adapters';

export interface EnvironmentLeaseRow {
  environmentId: string;
  runId?: string;
  status: 'active' | 'terminated' | 'failed';
  provider: string;
  acquiredAt: string;
  expiresAt: string;
  releasedAt?: string | null;
  metadataJson?: string | null;
}

export interface EnvironmentEventRow {
  id: string;
  environmentId: string;
  runId?: string;
  type: string;
  at: string;
  reason?: string;
  payloadJson?: string | null;
}

const LEASES_COLLECTION = 'environment_leases';
const EVENTS_COLLECTION = 'environment_events';

interface LeaseDoc extends BaseDocument {
  environmentId: string;
  runId: string | null;
  status: 'active' | 'terminated' | 'failed';
  provider: string;
  acquiredAt: string;
  expiresAt: string;
  releasedAt: string | null;
  metadataJson: string | null;
}

interface EventDoc extends BaseDocument {
  eventId: string;
  environmentId: string;
  runId: string | null;
  type: string;
  at: string;
  reason: string | null;
  payloadJson: string | null;
}

const docToRow = (doc: LeaseDoc): EnvironmentLeaseRow => ({
  environmentId: doc.environmentId,
  runId: doc.runId ?? undefined,
  status: doc.status,
  provider: doc.provider,
  acquiredAt: doc.acquiredAt,
  expiresAt: doc.expiresAt,
  releasedAt: doc.releasedAt,
  metadataJson: doc.metadataJson,
});

export class EnvironmentLeaseStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  /**
   * Idempotent schema bootstrap. Called automatically by every public
   * method on first use; safe to call explicitly during boot warm-up.
   */
  async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(LEASES_COLLECTION, {
          indexes: [
            { path: 'environmentId', unique: true },
            { path: 'status' },
            { path: 'expiresAt' },
          ],
        });
        await this.docs.ensureCollection(EVENTS_COLLECTION, {
          indexes: [
            { path: 'eventId', unique: true },
            { path: 'environmentId' },
            { path: 'at' },
          ],
        });
      })();
    }
    await this.initialised;
  }

  /**
   * Upsert lease record. Pre-existing rows are replaced wholesale
   * (preserves the prior PG/sqlite semantics).
   */
  async upsertLease(row: EnvironmentLeaseRow): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateOne<LeaseDoc>(
      LEASES_COLLECTION,
      { environmentId: { $eq: row.environmentId } },
      {
        $set: {
          environmentId: row.environmentId,
          runId: row.runId ?? null,
          status: row.status,
          provider: row.provider,
          acquiredAt: row.acquiredAt,
          expiresAt: row.expiresAt,
          releasedAt: row.releasedAt ?? null,
          metadataJson: row.metadataJson ?? null,
        },
      },
      { upsert: true },
    );
  }

  /** Append a single event row. Duplicate `id` raises (unique index). */
  async appendEvent(row: EnvironmentEventRow): Promise<void> {
    await this.ensureSchema();
    await this.docs.insertOne<EventDoc>(EVENTS_COLLECTION, {
      eventId: row.id,
      environmentId: row.environmentId,
      runId: row.runId ?? null,
      type: row.type,
      at: row.at,
      reason: row.reason ?? null,
      payloadJson: row.payloadJson ?? null,
    });
  }

  /**
   * Mark a lease as terminated and (optionally) record a
   * `environment.terminated` event capturing the reason.
   */
  async markTerminated(
    environmentId: string,
    releasedAt: string,
    reason?: string,
  ): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateOne<LeaseDoc>(
      LEASES_COLLECTION,
      { environmentId: { $eq: environmentId } },
      { $set: { status: 'terminated', releasedAt } },
    );

    if (reason) {
      await this.appendEvent({
        id: `${environmentId}-terminated-${Date.now()}`,
        environmentId,
        type: 'environment.terminated',
        at: releasedAt,
        reason,
      });
    }
  }

  /**
   * Return active leases whose `expiresAt` is at or before `nowIso`,
   * oldest-first. Used by the eviction loop.
   */
  async findExpiredActiveLeases(
    nowIso: string,
    limit = 50,
  ): Promise<EnvironmentLeaseRow[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<LeaseDoc>(
      LEASES_COLLECTION,
      {
        $and: [
          { status: { $eq: 'active' } },
          { expiresAt: { $lte: nowIso } },
        ],
      },
      { sort: { expiresAt: 1 }, limit },
    );
    return docs.map(docToRow);
  }
}
