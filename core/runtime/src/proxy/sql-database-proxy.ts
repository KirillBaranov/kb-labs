/**
 * @module @kb-labs/core-runtime/proxy
 * IPC proxy for ISQLDatabase adapter.
 *
 * This proxy forwards all SQL database operations to the parent process via IPC.
 * The parent process owns the real SQL adapter (e.g., SQLiteAdapter).
 *
 * Benefits:
 * - Single database connection (consistent data access across all workers)
 * - Reduced memory usage (no duplicate connections)
 * - No race conditions (centralized transaction management)
 *
 * @example
 * ```typescript
 * import { SQLDatabaseProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * // In child process (sandbox worker)
 * const transport = createIPCTransport();
 * const db = new SQLDatabaseProxy(transport);
 *
 * // Use like normal ISQLDatabase
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [123]);
 * console.log(result.rows);
 *
 * // Transactions
 * const tx = await db.transaction();
 * await tx.query('INSERT INTO users (name) VALUES (?)', ['Alice']);
 * await tx.commit();
 * ```
 */

import type { ISQLDatabase, SQLQueryResult, SQLTransaction } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

/**
 * IPC proxy for ISQLDatabase adapter.
 *
 * All method calls are forwarded to the parent process via IPC.
 * The parent process executes the call on the real SQL adapter
 * (e.g., SQLiteAdapter, PostgreSQLAdapter) and returns the result.
 */
export class SQLDatabaseProxy extends RemoteAdapter<ISQLDatabase> implements ISQLDatabase {
  /**
   * Create a SQL database proxy.
   *
   * @param transport - IPC transport to communicate with parent
   */
  constructor(transport: ITransport) {
    super('database.sql', transport);
  }

  /**
   * Execute a SQL query.
   *
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query result
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<SQLQueryResult<T>> {
    return (await this.callRemote('query', [sql, params])) as SQLQueryResult<T>;
  }

  /**
   * Begin a SQL transaction.
   *
   * @returns Transaction proxy object
   */
  async transaction(): Promise<SQLTransaction> {
    // Get transaction ID from parent
    const txId = (await this.callRemote('transaction', [])) as string;

    // Return transaction proxy that includes txId in all calls
    return {
      query: async <T = unknown>(sql: string, params?: unknown[]): Promise<SQLQueryResult<T>> => {
        return (await this.callRemote('transaction.query', [txId, sql, params])) as SQLQueryResult<T>;
      },

      commit: async (): Promise<void> => {
        await this.callRemote('transaction.commit', [txId]);
      },

      rollback: async (): Promise<void> => {
        await this.callRemote('transaction.rollback', [txId]);
      },
    };
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this.callRemote('close', []);
  }
}

/**
 * Create a SQL database proxy with IPC transport.
 *
 * @param transport - IPC transport to use
 * @returns SQL database proxy instance
 *
 * @example
 * ```typescript
 * import { createSQLDatabaseProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * const transport = createIPCTransport();
 * const db = createSQLDatabaseProxy(transport);
 * ```
 */
export function createSQLDatabaseProxy(transport: ITransport): SQLDatabaseProxy {
  return new SQLDatabaseProxy(transport);
}
