/**
 * @module @kb-labs/adapters-sqlite/kv-store
 *
 * SQLite implementation of `IKVStore` backed by `better-sqlite3`.
 *
 * Storage layout: a single table
 *   `kv(key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER NULL, version INTEGER NOT NULL DEFAULT 1)`
 *
 * - `value` stores the JSON-encoded payload (any JSON-serialisable value).
 * - `expires_at` is the absolute Unix ms when the entry stops being visible.
 * - `version` is bumped on every write — currently used by `cas` and reserved
 *    for future optimistic-concurrency clients.
 *
 * The adapter can share the underlying `better-sqlite3` handle with
 * `SqliteDocumentDatabase` so that both ride on a single file / WAL.
 */

import type Database from 'better-sqlite3';
import type {
  IKVStore,
  SetOpts,
  SignalOpts,
} from '@kb-labs/sdk';
import { acquireHandle, type SharedHandle } from './shared-handle.js';

const TABLE = '_kb_kv';

const now = (): number => Date.now();

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
};

const encode = (v: unknown): string => JSON.stringify(v);
const decode = <T>(raw: string | null): T | null => (raw === null ? null : JSON.parse(raw) as T);

export interface SqliteKVConfig {
  filename: string;
  workspace?: { cwd: string };
  readonly?: boolean;
  wal?: boolean;
  /** TTL sweeper interval in ms (default 30_000). Set to 0 to disable. */
  ttlSweepIntervalMs?: number;
}

export class SqliteKVStore implements IKVStore {
  private readonly db: Database.Database;
  private readonly handle: SharedHandle;
  private sweepHandle: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(config: SqliteKVConfig) {
    this.handle = acquireHandle({
      filename: config.filename,
      cwd: config.workspace?.cwd,
      readonly: config.readonly,
      wal: config.wal,
    });
    this.db = this.handle.handle;

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      ) STRICT`,
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_expires ON ${TABLE}(expires_at) WHERE expires_at IS NOT NULL`);

    const interval = config.ttlSweepIntervalMs ?? 30_000;
    if (interval > 0) {
      this.sweepHandle = setInterval(() => this.sweep(), interval).unref();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────────────

  async get<T = unknown>(key: string, options?: SignalOpts): Promise<T | null> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const row = this.db
      .prepare(
        `SELECT value FROM ${TABLE} WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(key, now()) as { value: string } | undefined;
    return row ? decode<T>(row.value) : null;
  }

  async getMany<T = unknown>(keys: string[], options?: SignalOpts): Promise<Array<T | null>> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    if (keys.length === 0) {return [];}
    const placeholders = keys.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT key, value FROM ${TABLE}
         WHERE key IN (${placeholders}) AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .all(...keys, now()) as Array<{ key: string; value: string }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return keys.map((k) => {
      const v = map.get(k);
      return v === undefined ? null : decode<T>(v);
    });
  }

  async exists(key: string, options?: SignalOpts): Promise<boolean> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const row = this.db
      .prepare(
        `SELECT 1 AS hit FROM ${TABLE} WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(key, now()) as { hit: number } | undefined;
    return row !== undefined;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Writes
  // ──────────────────────────────────────────────────────────────────────────

  async set<T = unknown>(key: string, value: T, options?: SetOpts): Promise<boolean> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    if (options?.ifNotExists && options.ifExists) {
      throw new Error('set: ifNotExists and ifExists are mutually exclusive');
    }
    const ts = now();
    const expiresAt = options?.ttlMs !== undefined ? ts + options.ttlMs : null;
    const encoded = encode(value);

    if (options?.ifNotExists) {
      // Replace if expired so callers can reclaim expired keys via ifNotExists.
      const info = this.db
        .prepare(
          `INSERT INTO ${TABLE}(key, value, expires_at, version) VALUES (?, ?, ?, 1)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             expires_at = excluded.expires_at,
             version = ${TABLE}.version + 1
           WHERE ${TABLE}.expires_at IS NOT NULL AND ${TABLE}.expires_at <= ?`,
        )
        .run(key, encoded, expiresAt, ts);
      return info.changes > 0;
    }

    if (options?.ifExists) {
      const info = this.db
        .prepare(
          `UPDATE ${TABLE} SET value = ?, expires_at = ?, version = version + 1
           WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .run(encoded, expiresAt, key, ts);
      return info.changes > 0;
    }

    this.db
      .prepare(
        `INSERT INTO ${TABLE}(key, value, expires_at, version) VALUES (?, ?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           expires_at = excluded.expires_at,
           version = ${TABLE}.version + 1`,
      )
      .run(key, encoded, expiresAt);
    return true;
  }

  async setMany<T = unknown>(
    entries: Array<{ key: string; value: T; ttlMs?: number }>,
    options?: SignalOpts,
  ): Promise<void> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    if (entries.length === 0) {return;}
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT INTO ${TABLE}(key, value, expires_at, version) VALUES (?, ?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         expires_at = excluded.expires_at,
         version = ${TABLE}.version + 1`,
    );
    this.db.exec('BEGIN');
    try {
      for (const { key, value, ttlMs } of entries) {
        const expiresAt = ttlMs !== undefined ? ts + ttlMs : null;
        stmt.run(key, encode(value), expiresAt);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  async setIfNotExists<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean> {
    return this.set(key, value, {
      ifNotExists: true,
      ttlMs: options?.ttlMs,
      signal: options?.signal,
    });
  }

  async delete(key: string, options?: SignalOpts): Promise<boolean> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const info = this.db.prepare(`DELETE FROM ${TABLE} WHERE key = ?`).run(key);
    return info.changes > 0;
  }

  async cas<T = unknown>(
    key: string,
    expected: T,
    next: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const ts = now();
    const expiresAt = options?.ttlMs !== undefined ? ts + options.ttlMs : null;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db
        .prepare(
          `SELECT value FROM ${TABLE} WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .get(key, ts) as { value: string } | undefined;
      if (!row) {
        this.db.exec('COMMIT');
        return false;
      }
      if (!deepEqual(JSON.parse(row.value) as unknown, expected as unknown)) {
        this.db.exec('COMMIT');
        return false;
      }
      this.db
        .prepare(
          `UPDATE ${TABLE} SET value = ?, expires_at = ?, version = version + 1 WHERE key = ?`,
        )
        .run(encode(next), expiresAt, key);
      this.db.exec('COMMIT');
      return true;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  async incr(
    key: string,
    delta = 1,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<number> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const ts = now();
    const expiresAt = options?.ttlMs !== undefined ? ts + options.ttlMs : null;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db
        .prepare(
          `SELECT value FROM ${TABLE} WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .get(key, ts) as { value: string } | undefined;
      let nextValue: number;
      if (!row) {
        nextValue = delta;
        this.db
          .prepare(
            `INSERT INTO ${TABLE}(key, value, expires_at, version) VALUES (?, ?, ?, 1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, version = ${TABLE}.version + 1`,
          )
          .run(key, encode(nextValue), expiresAt);
      } else {
        const current = JSON.parse(row.value) as unknown;
        if (typeof current !== 'number' || !Number.isFinite(current)) {
          throw new Error(`incr: existing value at '${key}' is not a number`);
        }
        nextValue = current + delta;
        // Only update expires_at when caller explicitly passed one — otherwise leave existing TTL alone.
        if (options?.ttlMs !== undefined) {
          this.db
            .prepare(`UPDATE ${TABLE} SET value = ?, expires_at = ?, version = version + 1 WHERE key = ?`)
            .run(encode(nextValue), expiresAt, key);
        } else {
          this.db
            .prepare(`UPDATE ${TABLE} SET value = ?, version = version + 1 WHERE key = ?`)
            .run(encode(nextValue), key);
        }
      }
      this.db.exec('COMMIT');
      return nextValue;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  async ttl(key: string): Promise<number | null> {
    this.checkOpen();
    const ts = now();
    const row = this.db
      .prepare(
        `SELECT expires_at FROM ${TABLE} WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(key, ts) as { expires_at: number | null } | undefined;
    if (!row || row.expires_at === null) {return null;}
    return row.expires_at - ts;
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    this.checkOpen();
    const ts = now();
    const info = this.db
      .prepare(
        `UPDATE ${TABLE} SET expires_at = ? WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .run(ts + ttlMs, key, ts);
    return info.changes > 0;
  }

  async persist(key: string): Promise<boolean> {
    this.checkOpen();
    const ts = now();
    const info = this.db
      .prepare(
        `UPDATE ${TABLE} SET expires_at = NULL WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .run(key, ts);
    return info.changes > 0;
  }

  async *scan(
    prefix?: string,
    options?: { batchSize?: number } & SignalOpts,
  ): AsyncIterable<{ key: string; value: unknown }> {
    this.checkOpen();
    const ts = now();
    const sql = prefix
      ? `SELECT key, value FROM ${TABLE} WHERE key LIKE ? ESCAPE '\\' AND (expires_at IS NULL OR expires_at > ?) ORDER BY key`
      : `SELECT key, value FROM ${TABLE} WHERE expires_at IS NULL OR expires_at > ? ORDER BY key`;
    const stmt = this.db.prepare(sql);
    const iter = (prefix
      ? stmt.iterate(likeEscape(prefix) + '%', ts)
      : stmt.iterate(ts)) as IterableIterator<{ key: string; value: string }>;
    const batchSize = options?.batchSize ?? 100;
    let count = 0;
    for (const row of iter) {
      if (options?.signal?.aborted) {break;}
      yield { key: row.key, value: JSON.parse(row.value) };
      count++;
      if (count % batchSize === 0 && options?.signal?.aborted) {break;}
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      this.db.prepare('SELECT 1').get();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async close(_options?: { drainTimeoutMs?: number }): Promise<void> {
    if (this.closed) {return;}
    this.closed = true;
    if (this.sweepHandle) {
      clearInterval(this.sweepHandle);
      this.sweepHandle = null;
    }
    this.handle.release();
  }

  private checkOpen(): void {
    if (this.closed) {throw new Error('KV store is closed');}
  }

  private sweep(): void {
    if (this.closed) {return;}
    try {
      this.db
        .prepare(`DELETE FROM ${TABLE} WHERE expires_at IS NOT NULL AND expires_at <= ?`)
        .run(now());
    } catch {
      /* table dropped externally — ignore */
    }
  }
}

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {return true;}
  if (a === null || b === null) {return false;}
  if (typeof a !== typeof b) {return false;}
  if (typeof a !== 'object') {return false;}
  if (Array.isArray(a) !== Array.isArray(b)) {return false;}
  if (Array.isArray(a)) {
    const ba = b as unknown[];
    if (a.length !== ba.length) {return false;}
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], ba[i])) {return false;}
    }
    return true;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  const kb = Object.keys(rb);
  if (ka.length !== kb.length) {return false;}
  for (const k of ka) {
    if (!deepEqual(ra[k], rb[k])) {return false;}
  }
  return true;
};

const likeEscape = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

export const createSqliteKVStore = (config: SqliteKVConfig): SqliteKVStore =>
  new SqliteKVStore(config);
