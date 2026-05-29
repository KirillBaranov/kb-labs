import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteHostStore } from '../stores/sqlite-host-store.js';
import type { HostDescriptor } from '@kb-labs/gateway-contracts';
import type { ISQLDatabase, SQLQueryResult } from '@kb-labs/core-platform';

/**
 * In-memory SQL database for testing.
 * Implements ISQLDatabase with a simple Map-based storage.
 */
function createInMemoryDb(): ISQLDatabase {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const ddlExecuted: string[] = [];

  return {
    async exec(sql: string) {
      ddlExecuted.push(sql);
      // Parse CREATE TABLE to track table names
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (match && !tables.has(match[1]!)) {
        tables.set(match[1]!, new Map());
      }
    },

    async query<T>(sql: string, params?: unknown[]): Promise<SQLQueryResult<T>> {
      const trimmed = sql.trim().toUpperCase();

      // CREATE TABLE (fallback if exec not used)
      if (trimmed.startsWith('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (match && !tables.has(match[1]!)) {
          tables.set(match[1]!, new Map());
        }
        return { rows: [], rowCount: 0 };
      }

      // INSERT ... ON CONFLICT DO UPDATE
      if (trimmed.startsWith('INSERT INTO')) {
        const tableMatch = sql.match(/INSERT INTO (\w+)/i);
        if (!tableMatch) {return { rows: [], rowCount: 0 };}
        const tableName = tableMatch[1]!;
        const table = tables.get(tableName);
        if (!table) {return { rows: [], rowCount: 0 };}

        // Extract column names
        const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
        if (!colMatch) {return { rows: [], rowCount: 0 };}
        const columns = colMatch[1]!.split(',').map(c => c.trim());

        const row: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          row[col] = params?.[i];
        });

        // Use composite key for hosts, single key for host_tokens
        let key: string;
        if (tableName === 'hosts') {
          key = `${row.host_id}:${row.namespace_id}`;
        } else if (tableName === 'host_tokens') {
          key = row.token as string;
        } else {
          key = String(row[columns[0]!]);
        }

        // ON CONFLICT: update if exists
        if (table.has(key) && sql.includes('ON CONFLICT')) {
          const existing = table.get(key)!;
          // Merge — update fields from excluded (new values)
          const merged = { ...existing };
          for (const col of columns) {
            // Don't update created_at on conflict
            if (col === 'created_at' && existing[col]) {continue;}
            merged[col] = row[col];
          }
          table.set(key, merged);
        } else {
          table.set(key, row);
        }

        return { rows: [], rowCount: 1 };
      }

      // SELECT
      if (trimmed.startsWith('SELECT')) {
        const tableMatch = sql.match(/FROM (\w+)/i);
        if (!tableMatch) {return { rows: [], rowCount: 0 };}
        const table = tables.get(tableMatch[1]!);
        if (!table) {return { rows: [] as T[], rowCount: 0 };}

        let rows = Array.from(table.values());

        // WHERE clauses
        if (sql.includes('WHERE')) {
          const conditions = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s*$)/is);
          if (conditions) {
            const whereClause = conditions[1]!;
            const paramsCopy = [...(params ?? [])];

            // Parse AND-separated conditions
            const parts = whereClause.split(/\s+AND\s+/i);
            for (const part of parts) {
              const condMatch = part.match(/(\w+)\s*=\s*\?/);
              if (condMatch) {
                const col = condMatch[1]!;
                const val = paramsCopy.shift();
                rows = rows.filter(r => r[col] === val);
              }
            }
          }
        }

        return { rows: rows as T[], rowCount: rows.length };
      }

      // DELETE
      if (trimmed.startsWith('DELETE')) {
        const tableMatch = sql.match(/FROM (\w+)/i);
        if (!tableMatch) {return { rows: [], rowCount: 0 };}
        const table = tables.get(tableMatch[1]!);
        if (!table) {return { rows: [], rowCount: 0 };}

        let count = 0;

        if (sql.includes('WHERE')) {
          const paramsCopy = [...(params ?? [])];
          const conditions = sql.match(/WHERE\s+(.+)/is);
          if (conditions) {
            const parts = conditions[1]!.split(/\s+AND\s+/i);
            const filters: Array<{ col: string; val: unknown }> = [];
            for (const part of parts) {
              const condMatch = part.match(/(\w+)\s*=\s*\?/);
              if (condMatch) {
                filters.push({ col: condMatch[1]!, val: paramsCopy.shift() });
              }
            }

            for (const [key, row] of table) {
              if (filters.every(f => row[f.col] === f.val)) {
                table.delete(key);
                count++;
              }
            }
          }
        }

        return { rows: [], rowCount: count };
      }

      return { rows: [], rowCount: 0 };
    },

    async transaction() {
      throw new Error('Not implemented in test');
    },

    async close() {},
  };
}

function makeDescriptor(overrides: Partial<HostDescriptor> = {}): HostDescriptor {
  return {
    hostId: 'host-1',
    name: 'test-host',
    namespaceId: 'default',
    capabilities: ['filesystem', 'git'],
    status: 'offline',
    lastSeen: Date.now(),
    connections: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('SqliteHostStore', () => {
  let db: ISQLDatabase;
  let store: SqliteHostStore;

  beforeEach(() => {
    db = createInMemoryDb();
    store = new SqliteHostStore(db);
  });

  describe('save + get', () => {
    it('persists and retrieves a host descriptor', async () => {
      const host = makeDescriptor();
      await store.save(host);

      const retrieved = await store.get('host-1', 'default');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.hostId).toBe('host-1');
      expect(retrieved!.name).toBe('test-host');
      expect(retrieved!.capabilities).toEqual(['filesystem', 'git']);
      expect(retrieved!.status).toBe('offline'); // always offline from store
    });

    it('returns null for non-existent host', async () => {
      const result = await store.get('nonexistent', 'default');
      expect(result).toBeNull();
    });

    it('upserts on save with same hostId+namespace', async () => {
      await store.save(makeDescriptor({ name: 'v1' }));
      await store.save(makeDescriptor({ name: 'v2' }));

      const retrieved = await store.get('host-1', 'default');
      expect(retrieved!.name).toBe('v2');
    });
  });

  describe('list', () => {
    it('lists hosts in a namespace', async () => {
      await store.save(makeDescriptor({ hostId: 'h1' }));
      await store.save(makeDescriptor({ hostId: 'h2' }));
      await store.save(makeDescriptor({ hostId: 'h3', namespaceId: 'other' }));

      const defaultHosts = await store.list('default');
      expect(defaultHosts).toHaveLength(2);

      const otherHosts = await store.list('other');
      expect(otherHosts).toHaveLength(1);
    });

    it('listAll returns all namespaces', async () => {
      await store.save(makeDescriptor({ hostId: 'h1', namespaceId: 'ns1' }));
      await store.save(makeDescriptor({ hostId: 'h2', namespaceId: 'ns2' }));

      const all = await store.listAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('removes a host and returns true', async () => {
      await store.save(makeDescriptor());
      const deleted = await store.delete('host-1', 'default');
      expect(deleted).toBe(true);

      const retrieved = await store.get('host-1', 'default');
      expect(retrieved).toBeNull();
    });

    it('returns false for non-existent host', async () => {
      const deleted = await store.delete('nonexistent', 'default');
      expect(deleted).toBe(false);
    });
  });

  describe('tokens', () => {
    it('saves and resolves a machine token', async () => {
      await store.saveToken('tok-abc', 'host-1', 'default');

      const resolved = await store.resolveToken('tok-abc');
      expect(resolved).toEqual({ hostId: 'host-1', namespaceId: 'default' });
    });

    it('returns null for unknown token', async () => {
      const resolved = await store.resolveToken('unknown');
      expect(resolved).toBeNull();
    });

    it('deleteToken removes the mapping', async () => {
      await store.saveToken('tok-abc', 'host-1', 'default');
      await store.deleteToken('tok-abc');

      const resolved = await store.resolveToken('tok-abc');
      expect(resolved).toBeNull();
    });

    it('delete host also removes its tokens', async () => {
      await store.save(makeDescriptor());
      await store.saveToken('tok-1', 'host-1', 'default');

      await store.delete('host-1', 'default');

      const resolved = await store.resolveToken('tok-1');
      expect(resolved).toBeNull();
    });
  });
});
