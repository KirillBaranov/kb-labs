/**
 * @module @kb-labs/adapters-sqlite/shared-handle
 *
 * Process-wide cache of `better-sqlite3` handles keyed by resolved filename.
 *
 * Why this exists: the package exports two adapter factories — Document at
 * the main entry and KV at the `/kv` subpath. When both are configured
 * against the same database file (the recommended setup), we want them to
 * ride a single handle so:
 *   - WAL is opened once,
 *   - PRAGMAs are set once,
 *   - the TTL sweeper isn't duplicated,
 *   - transactions on one adapter don't fight transactions on the other,
 *   - `close()` from either side is idempotent and bounded by refcount.
 *
 * Distinct filenames get distinct handles. `:memory:` is special-cased: it
 * is never shared (each call gets a fresh in-process database, which is
 * what tests expect).
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

interface Entry {
  handle: Database.Database;
  refcount: number;
}

const cache = new Map<string, Entry>();

const resolveKey = (filename: string, cwd?: string): string => {
  if (filename === ':memory:') {return '';}
  if (isAbsolute(filename)) {return filename;}
  if (cwd) {return join(cwd, filename);}
  return filename;
};

export interface AcquireOpts {
  filename: string;
  cwd?: string;
  readonly?: boolean;
  wal?: boolean;
}

export interface SharedHandle {
  handle: Database.Database;
  release: () => void;
}

export function acquireHandle(opts: AcquireOpts): SharedHandle {
  if (opts.filename === ':memory:') {
    const handle = new Database(':memory:', { readonly: opts.readonly ?? false });
    handle.pragma('foreign_keys = ON');
    handle.pragma('case_sensitive_like = ON');
    return {
      handle,
      release: () => { try { handle.close(); } catch { /* already closed */ } },
    };
  }

  const key = resolveKey(opts.filename, opts.cwd);
  const existing = cache.get(key);
  if (existing) {
    existing.refcount++;
    return wrap(key, existing);
  }

  // Ensure parent directory exists — better-sqlite3 does not create it.
  if (!opts.readonly) {
    mkdirSync(dirname(key), { recursive: true });
  }

  const handle = new Database(key, { readonly: opts.readonly ?? false });
  if (!opts.readonly && opts.wal !== false) {
    handle.pragma('journal_mode = WAL');
  }
  handle.pragma('foreign_keys = ON');
  // Make LIKE case-sensitive — the $startsWith / $contains / $endsWith
  // operators in IDocumentDatabase are defined as case-sensitive and
  // SQLite's default ASCII-fold violates that contract.
  handle.pragma('case_sensitive_like = ON');

  const entry: Entry = { handle, refcount: 1 };
  cache.set(key, entry);
  return wrap(key, entry);
}

const wrap = (key: string, entry: Entry): SharedHandle => ({
  handle: entry.handle,
  release: () => {
    entry.refcount--;
    if (entry.refcount <= 0) {
      cache.delete(key);
      try { entry.handle.close(); } catch { /* already closed */ }
    }
  },
});
