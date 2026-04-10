/**
 * @module @kb-labs/core-runtime/environment-lease-store
 * SQL-backed persistence for environment leases and events.
 */

import type { ISQLDatabase } from '@kb-labs/core-platform/adapters';

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

/**
 * SQL persistence helper for environment lifecycle.
 */
export class EnvironmentLeaseStore {
  private schemaReady = false;

  constructor(private readonly db: ISQLDatabase) {}

  /**
   * Ensure required schema exists.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaReady) {
      return;
    }

    const createLeasesSql = `
      CREATE TABLE IF NOT EXISTS environment_leases (
        environment_id TEXT PRIMARY KEY,
        run_id TEXT,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        released_at TEXT,
        metadata_json TEXT
      )
    `;

    const createEventsSql = `
      CREATE TABLE IF NOT EXISTS environment_events (
        id TEXT PRIMARY KEY,
        environment_id TEXT NOT NULL,
        run_id TEXT,
        type TEXT NOT NULL,
        at TEXT NOT NULL,
        reason TEXT,
        payload_json TEXT
      )
    `;

    if (typeof this.db.exec === 'function') {
      await this.db.exec(createLeasesSql);
      await this.db.exec(createEventsSql);
    } else {
      await this.db.query(createLeasesSql);
      await this.db.query(createEventsSql);
    }

    this.schemaReady = true;
  }

  /**
   * Upsert lease record.
   */
  async upsertLease(row: EnvironmentLeaseRow): Promise<void> {
    await this.ensureSchema();

    await this.db.query(
      `
        INSERT INTO environment_leases (
          environment_id,
          run_id,
          status,
          provider,
          acquired_at,
          expires_at,
          released_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(environment_id) DO UPDATE SET
          run_id = excluded.run_id,
          status = excluded.status,
          provider = excluded.provider,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at,
          released_at = excluded.released_at,
          metadata_json = excluded.metadata_json
      `,
      [
        row.environmentId,
        row.runId ?? null,
        row.status,
        row.provider,
        row.acquiredAt,
        row.expiresAt,
        row.releasedAt ?? null,
        row.metadataJson ?? null,
      ]
    );
  }

  /**
   * Append event.
   */
  async appendEvent(row: EnvironmentEventRow): Promise<void> {
    await this.ensureSchema();

    await this.db.query(
      `
        INSERT INTO environment_events (
          id,
          environment_id,
          run_id,
          type,
          at,
          reason,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.environmentId,
        row.runId ?? null,
        row.type,
        row.at,
        row.reason ?? null,
        row.payloadJson ?? null,
      ]
    );
  }

  /**
   * Mark lease as terminated.
   */
  async markTerminated(environmentId: string, releasedAt: string, reason?: string): Promise<void> {
    await this.ensureSchema();

    await this.db.query(
      `
        UPDATE environment_leases
        SET status = 'terminated', released_at = ?
        WHERE environment_id = ?
      `,
      [releasedAt, environmentId]
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
   * Find active leases that expired before given timestamp.
   */
  async findExpiredActiveLeases(nowIso: string, limit = 50): Promise<EnvironmentLeaseRow[]> {
    await this.ensureSchema();

    const result = await this.db.query<{
      environment_id: string;
      run_id: string | null;
      status: string;
      provider: string;
      acquired_at: string;
      expires_at: string;
      released_at: string | null;
      metadata_json: string | null;
    }>(
      `
        SELECT
          environment_id,
          run_id,
          status,
          provider,
          acquired_at,
          expires_at,
          released_at,
          metadata_json
        FROM environment_leases
        WHERE status = 'active' AND expires_at <= ?
        ORDER BY expires_at ASC
        LIMIT ?
      `,
      [nowIso, limit]
    );

    return result.rows.map((row) => ({
      environmentId: row.environment_id,
      runId: row.run_id ?? undefined,
      status: row.status as EnvironmentLeaseRow['status'],
      provider: row.provider,
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
      releasedAt: row.released_at,
      metadataJson: row.metadata_json,
    }));
  }
}

