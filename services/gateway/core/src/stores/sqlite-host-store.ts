/**
 * SQLite-backed implementation of IHostStore.
 *
 * Persists host descriptors and machine tokens across Gateway restarts.
 * Auto-creates tables on first use.
 */

import type { ISQLDatabase } from '@kb-labs/core-platform';
import type { IHostStore, HostDescriptor } from '@kb-labs/gateway-contracts';

const HOSTS_DDL = `
CREATE TABLE IF NOT EXISTS hosts (
  host_id       TEXT NOT NULL,
  namespace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  capabilities  TEXT NOT NULL DEFAULT '[]',
  host_type     TEXT,
  workspaces    TEXT,
  plugins       TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (host_id, namespace_id)
);
`;

const TOKENS_DDL = `
CREATE TABLE IF NOT EXISTS host_tokens (
  token         TEXT PRIMARY KEY,
  host_id       TEXT NOT NULL,
  namespace_id  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
`;

interface HostRow {
  host_id: string;
  namespace_id: string;
  name: string;
  capabilities: string;
  host_type: string | null;
  workspaces: string | null;
  plugins: string | null;
  created_at: number;
  updated_at: number;
}

interface TokenRow {
  token: string;
  host_id: string;
  namespace_id: string;
  created_at: number;
}

function rowToDescriptor(row: HostRow): HostDescriptor {
  return {
    hostId: row.host_id,
    name: row.name,
    namespaceId: row.namespace_id,
    capabilities: JSON.parse(row.capabilities),
    status: 'offline', // persisted hosts start as offline; cache tracks live status
    lastSeen: row.updated_at,
    connections: [],
    hostType: row.host_type as HostDescriptor['hostType'],
    workspaces: row.workspaces ? JSON.parse(row.workspaces) : undefined,
    plugins: row.plugins ? JSON.parse(row.plugins) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteHostStore implements IHostStore {
  private migrated = false;

  constructor(private readonly db: ISQLDatabase) {}

  private async migrate(): Promise<void> {
    if (this.migrated) {return;}
    if (this.db.exec) {
      await this.db.exec(HOSTS_DDL);
      await this.db.exec(TOKENS_DDL);
    } else {
      await this.db.query(HOSTS_DDL);
      await this.db.query(TOKENS_DDL);
    }
    this.migrated = true;
  }

  async save(descriptor: HostDescriptor): Promise<void> {
    await this.migrate();
    const now = Date.now();
    await this.db.query(
      `INSERT INTO hosts (host_id, namespace_id, name, capabilities, host_type, workspaces, plugins, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (host_id, namespace_id) DO UPDATE SET
         name = excluded.name,
         capabilities = excluded.capabilities,
         host_type = excluded.host_type,
         workspaces = excluded.workspaces,
         plugins = excluded.plugins,
         updated_at = excluded.updated_at`,
      [
        descriptor.hostId,
        descriptor.namespaceId,
        descriptor.name,
        JSON.stringify(descriptor.capabilities),
        descriptor.hostType ?? null,
        descriptor.workspaces ? JSON.stringify(descriptor.workspaces) : null,
        descriptor.plugins ? JSON.stringify(descriptor.plugins) : null,
        descriptor.createdAt ?? now,
        now,
      ],
    );
  }

  async get(hostId: string, namespaceId: string): Promise<HostDescriptor | null> {
    await this.migrate();
    const result = await this.db.query<HostRow>(
      'SELECT * FROM hosts WHERE host_id = ? AND namespace_id = ?',
      [hostId, namespaceId],
    );
    const row = result.rows[0];
    return row ? rowToDescriptor(row) : null;
  }

  async list(namespaceId: string): Promise<HostDescriptor[]> {
    await this.migrate();
    const result = await this.db.query<HostRow>(
      'SELECT * FROM hosts WHERE namespace_id = ? ORDER BY created_at',
      [namespaceId],
    );
    return result.rows.map(rowToDescriptor);
  }

  async listAll(): Promise<HostDescriptor[]> {
    await this.migrate();
    const result = await this.db.query<HostRow>(
      'SELECT * FROM hosts ORDER BY namespace_id, created_at',
    );
    return result.rows.map(rowToDescriptor);
  }

  async delete(hostId: string, namespaceId: string): Promise<boolean> {
    await this.migrate();
    // Remove tokens for this host first
    await this.db.query(
      'DELETE FROM host_tokens WHERE host_id = ? AND namespace_id = ?',
      [hostId, namespaceId],
    );
    const result = await this.db.query(
      'DELETE FROM hosts WHERE host_id = ? AND namespace_id = ?',
      [hostId, namespaceId],
    );
    return result.rowCount > 0;
  }

  async saveToken(token: string, hostId: string, namespaceId: string): Promise<void> {
    await this.migrate();
    await this.db.query(
      `INSERT INTO host_tokens (token, host_id, namespace_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (token) DO UPDATE SET
         host_id = excluded.host_id,
         namespace_id = excluded.namespace_id`,
      [token, hostId, namespaceId, Date.now()],
    );
  }

  async resolveToken(token: string): Promise<{ hostId: string; namespaceId: string } | null> {
    await this.migrate();
    const result = await this.db.query<TokenRow>(
      'SELECT * FROM host_tokens WHERE token = ?',
      [token],
    );
    const row = result.rows[0];
    return row ? { hostId: row.host_id, namespaceId: row.namespace_id } : null;
  }

  async deleteToken(token: string): Promise<void> {
    await this.migrate();
    await this.db.query('DELETE FROM host_tokens WHERE token = ?', [token]);
  }
}
