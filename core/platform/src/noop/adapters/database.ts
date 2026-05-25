/**
 * @module @kb-labs/core-platform/noop/adapters/database
 * NoOp database implementations for testing.
 *
 * These adapters throw errors when called - they exist only to satisfy
 * type requirements when database access is not configured.
 */

import type {
  ISQLDatabase,
  SQLQueryResult,
  SQLTransaction,
  IDocumentDatabase,
  BaseDocument,
  DocumentFilter,
  DocumentUpdate,
  FindOptions,
  IKeyValueDatabase,
  ITimeSeriesDatabase,
  TimeSeriesPoint,
  IDatabaseProvider,
} from '../../adapters/database.js';

// ============================================================================
// SQL DATABASE (NoOp)
// ============================================================================

/**
 * NoOp SQL database - throws on all operations.
 * Used when SQL database is not configured.
 */
export class NoOpSQLDatabase implements ISQLDatabase {
  async query<T = unknown>(_sql: string, _params?: unknown[]): Promise<SQLQueryResult<T>> {
    throw new Error('SQL database not configured');
  }

  async transaction(): Promise<SQLTransaction> {
    throw new Error('SQL database not configured');
  }

  async close(): Promise<void> {
    // NoOp - nothing to close
  }
}

// ============================================================================
// DOCUMENT DATABASE (NoOp)
// ============================================================================

/**
 * NoOp document database - throws on all operations.
 * Used when document database is not configured.
 */
export class NoOpDocumentDatabase implements IDocumentDatabase {
  async find<T extends BaseDocument>(
    _collection: string,
    _filter: DocumentFilter<T>,
    _options?: FindOptions
  ): Promise<T[]> {
    throw new Error('Document database not configured');
  }

  async findById<T extends BaseDocument>(_collection: string, _id: string): Promise<T | null> {
    throw new Error('Document database not configured');
  }

  async insertOne<T extends BaseDocument>(
    _collection: string,
    _document: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<T> {
    throw new Error('Document database not configured');
  }

  async updateMany<T extends BaseDocument>(
    _collection: string,
    _filter: DocumentFilter<T>,
    _update: DocumentUpdate<T>
  ): Promise<number> {
    throw new Error('Document database not configured');
  }

  async updateById<T extends BaseDocument>(
    _collection: string,
    _id: string,
    _update: DocumentUpdate<T>
  ): Promise<T | null> {
    throw new Error('Document database not configured');
  }

  async deleteMany<T extends BaseDocument>(_collection: string, _filter: DocumentFilter<T>): Promise<number> {
    throw new Error('Document database not configured');
  }

  async deleteById(_collection: string, _id: string): Promise<boolean> {
    throw new Error('Document database not configured');
  }

  async count<T extends BaseDocument>(_collection: string, _filter: DocumentFilter<T>): Promise<number> {
    throw new Error('Document database not configured');
  }

  async close(): Promise<void> {
    // NoOp - nothing to close
  }
}

// ============================================================================
// KEY-VALUE DATABASE (NoOp)
// ============================================================================

/**
 * NoOp key-value database - throws on all operations.
 * Used when KV database is not configured.
 */
export class NoOpKVDatabase implements IKeyValueDatabase {
  async get(_key: string): Promise<string | null> {
    throw new Error('Key-value database not configured');
  }

  async set(_key: string, _value: string, _ttlMs?: number): Promise<void> {
    throw new Error('Key-value database not configured');
  }

  async delete(_key: string): Promise<boolean> {
    throw new Error('Key-value database not configured');
  }

  async exists(_key: string): Promise<boolean> {
    throw new Error('Key-value database not configured');
  }

  async keys(_pattern: string): Promise<string[]> {
    throw new Error('Key-value database not configured');
  }

  async close(): Promise<void> {
    // NoOp - nothing to close
  }
}

// ============================================================================
// TIME-SERIES DATABASE (NoOp)
// ============================================================================

/**
 * NoOp time-series database - throws on all operations.
 * Used when time-series database is not configured.
 */
export class NoOpTimeSeriesDatabase implements ITimeSeriesDatabase {
  async write(_metric: string, _point: TimeSeriesPoint): Promise<void> {
    throw new Error('Time-series database not configured');
  }

  async writeBatch(_metric: string, _points: TimeSeriesPoint[]): Promise<void> {
    throw new Error('Time-series database not configured');
  }

  async query(
    _metric: string,
    _startTime: number,
    _endTime: number,
    _tags?: Record<string, string>
  ): Promise<TimeSeriesPoint[]> {
    throw new Error('Time-series database not configured');
  }

  async close(): Promise<void> {
    // NoOp - nothing to close
  }
}

// ============================================================================
// DATABASE PROVIDER (NoOp)
// ============================================================================

/**
 * NoOp database provider - returns NoOp adapters for all database types.
 * Used when databases are not configured.
 */
export class NoOpDatabaseProvider implements IDatabaseProvider {
  async getSQLDatabase(_name: string): Promise<ISQLDatabase> {
    return new NoOpSQLDatabase();
  }

  async getDocumentDatabase(_name: string): Promise<IDocumentDatabase> {
    return new NoOpDocumentDatabase();
  }

  async getKeyValueDatabase(_name: string): Promise<IKeyValueDatabase> {
    return new NoOpKVDatabase();
  }

  async getTimeSeriesDatabase(_name: string): Promise<ITimeSeriesDatabase> {
    return new NoOpTimeSeriesDatabase();
  }

  async close(): Promise<void> {
    // NoOp - nothing to close
  }
}
