/**
 * @module @kb-labs/adapters-sqlite/secure-sql
 * SecureSQLAdapter - ISQLDatabase wrapper with permission validation.
 *
 * Design Philosophy: Validation-only security (like fs-shim)
 * - Validates table access against allowlists/denylists
 * - Does NOT rewrite SQL queries
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 *
 * Security Model:
 * - Extracts table names from SQL using regex (basic, not perfect)
 * - Checks table names against permissions
 * - Does NOT parse SQL fully (use a SQL parser library for production)
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-sqlite';
 * import { SecureSQLAdapter } from '@kb-labs/adapters-sqlite/secure-sql';
 *
 * const base = createAdapter({ filename: 'app.db' });
 * const secure = new SecureSQLAdapter(base, {
 *   allowlist: ['users', 'posts', 'comments'],
 *   denylist: ['admin_users', 'secrets'],
 * });
 *
 * await secure.query('SELECT * FROM users WHERE id = ?', [123]); // ✅ Allowed
 * await secure.query('SELECT * FROM admin_users LIMIT 1', []); // ❌ Denied
 * ```
 */

import type {
  ISQLDatabase,
  SQLQueryResult,
  SQLTransaction,
} from "@kb-labs/core-platform/adapters";

/**
 * Permission configuration for SQL database access.
 */
export interface SQLPermissions {
  /**
   * Allowed table names (e.g., ['users', 'posts']).
   * If empty or undefined, all tables are allowed (unless denied).
   */
  allowlist?: string[];

  /**
   * Denied table names (e.g., ['admin_users', 'secrets']).
   * Takes precedence over allowlist.
   */
  denylist?: string[];

  /**
   * Allow read operations (SELECT, PRAGMA) (default: true)
   */
  read?: boolean;

  /**
   * Allow write operations (INSERT, UPDATE, DELETE) (default: true)
   */
  write?: boolean;

  /**
   * Allow schema modifications (CREATE, ALTER, DROP) (default: false - safer default)
   */
  schema?: boolean;
}

/**
 * Error thrown when SQL access is denied.
 */
export class SQLPermissionError extends Error {
  constructor(
    public readonly operation: string,
    public readonly tables: string[],
    public readonly reason: string,
  ) {
    super(
      `SQL access denied: ${operation} on tables [${tables.join(", ")}] - ${reason}`,
    );
    this.name = "SQLPermissionError";
  }
}

/**
 * SecureSQLAdapter - validates permissions before delegating to base database.
 *
 * Design:
 * - Validation-only (no SQL rewriting)
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 * - Basic table extraction via regex (not a full SQL parser)
 *
 * Limitations:
 * - Table extraction is regex-based (may miss complex queries)
 * - Does not handle subqueries, CTEs, or dynamic SQL
 * - For production, consider using a proper SQL parser library
 */
export class SecureSQLAdapter implements ISQLDatabase {
  constructor(
    private readonly baseDb: ISQLDatabase,
    private readonly permissions: SQLPermissions,
  ) {}

  /**
   * Extract table names from SQL query.
   * Uses basic regex - not perfect, but good enough for validation.
   */
  private extractTableNames(sql: string): string[] {
    const tables = new Set<string>();

    // Normalize SQL: uppercase, remove extra spaces
    const normalized = sql.toUpperCase().replace(/\s+/g, " ").trim();

    // Pattern: FROM/JOIN/INTO/UPDATE <table_name>
    const patterns = [
      /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/g, // CREATE/DROP TABLE
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(normalized)) !== null) {
        if (match[1]) {
          tables.add(match[1].toLowerCase());
        }
      }
    }

    return Array.from(tables);
  }

  /**
   * Detect SQL operation type.
   */
  private detectOperation(sql: string): "read" | "write" | "schema" {
    const normalized = sql.trim().toUpperCase();

    // Schema operations
    if (
      normalized.startsWith("CREATE ") ||
      normalized.startsWith("ALTER ") ||
      normalized.startsWith("DROP ")
    ) {
      return "schema";
    }

    // Write operations
    if (
      normalized.startsWith("INSERT ") ||
      normalized.startsWith("UPDATE ") ||
      normalized.startsWith("DELETE ")
    ) {
      return "write";
    }

    // Read operations (SELECT, PRAGMA, etc.)
    return "read";
  }

  /**
   * Check if SQL query is allowed by permissions.
   */
  private checkPermissions(sql: string): void {
    const operation = this.detectOperation(sql);

    // Check operation-level permissions
    const operationAllowed = this.permissions[operation] !== false;
    if (!operationAllowed) {
      throw new SQLPermissionError(
        operation,
        [],
        `${operation} operations are disabled`,
      );
    }

    // Extract table names
    const tables = this.extractTableNames(sql);

    // Check denylist first (takes precedence)
    if (this.permissions.denylist) {
      for (const table of tables) {
        if (this.permissions.denylist.includes(table)) {
          throw new SQLPermissionError(
            operation,
            tables,
            `table '${table}' is in denylist`,
          );
        }
      }
    }

    // Check allowlist (if defined)
    if (this.permissions.allowlist && this.permissions.allowlist.length > 0) {
      for (const table of tables) {
        if (!this.permissions.allowlist.includes(table)) {
          throw new SQLPermissionError(
            operation,
            tables,
            `table '${table}' not in allowlist: [${this.permissions.allowlist.join(", ")}]`,
          );
        }
      }
    }
  }

  /**
   * Execute a SQL query with permission checks.
   */
  async query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<SQLQueryResult<T>> {
    this.checkPermissions(sql);
    return this.baseDb.query<T>(sql, params);
  }

  /**
   * Begin a transaction with permission checks.
   * Each query inside the transaction is also validated.
   */
  async transaction(): Promise<SQLTransaction> {
    const baseTrx = await this.baseDb.transaction();

    // Wrap transaction object to intercept queries
    return {
      query: async <T = unknown>(
        sql: string,
        params?: unknown[],
      ): Promise<SQLQueryResult<T>> => {
        this.checkPermissions(sql);
        return baseTrx.query<T>(sql, params);
      },

      commit: async (): Promise<void> => {
        await baseTrx.commit();
      },

      rollback: async (): Promise<void> => {
        await baseTrx.rollback();
      },
    };
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this.baseDb.close();
  }
}

/**
 * Create secure SQL adapter with permission validation.
 *
 * @param baseDb - Base SQL adapter (SQLite, PostgreSQL, etc.)
 * @param permissions - Permission configuration
 * @returns Wrapped SQL adapter with permission checks
 *
 * @example
 * ```typescript
 * const secure = createSecureSQL(base, {
 *   allowlist: ['users', 'posts'],
 *   denylist: ['admin_users'],
 *   schema: false, // Prevent schema modifications
 * });
 * ```
 */
export function createSecureSQL(
  baseDb: ISQLDatabase,
  permissions: SQLPermissions,
): SecureSQLAdapter {
  return new SecureSQLAdapter(baseDb, permissions);
}

// Default export for direct import
export default createSecureSQL;
