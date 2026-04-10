/**
 * @module @kb-labs/core-runtime/proxy
 * IPC proxy for IDocumentDatabase adapter.
 *
 * This proxy forwards all document database operations to the parent process via IPC.
 * The parent process owns the real document adapter (e.g., MongoDBAdapter).
 *
 * Benefits:
 * - Single database connection (consistent data access across all workers)
 * - Reduced memory usage (no duplicate connections)
 * - No race conditions (centralized transaction management)
 *
 * @example
 * ```typescript
 * import { DocumentDatabaseProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * // In child process (sandbox worker)
 * const transport = createIPCTransport();
 * const db = new DocumentDatabaseProxy(transport);
 *
 * // Use like normal IDocumentDatabase
 * const users = await db.find('users', { age: { $gt: 18 } }, { limit: 10 });
 * console.log(users);
 *
 * // Update by ID
 * const updated = await db.updateById('users', '123', { $set: { active: true } });
 * ```
 */

import type {
  IDocumentDatabase,
  BaseDocument,
  DocumentFilter,
  DocumentUpdate,
  FindOptions,
} from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

/**
 * IPC proxy for IDocumentDatabase adapter.
 *
 * All method calls are forwarded to the parent process via IPC.
 * The parent process executes the call on the real document adapter
 * (e.g., MongoDBAdapter) and returns the result.
 */
export class DocumentDatabaseProxy extends RemoteAdapter<IDocumentDatabase> implements IDocumentDatabase {
  /**
   * Create a document database proxy.
   *
   * @param transport - IPC transport to communicate with parent
   */
  constructor(transport: ITransport) {
    super('database.document', transport);
  }

  /**
   * Find documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @param options - Find options (limit, skip, sort)
   * @returns Array of matching documents
   */
  async find<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions
  ): Promise<T[]> {
    return (await this.callRemote('find', [collection, filter, options])) as T[];
  }

  /**
   * Find a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns Document or null if not found
   */
  async findById<T extends BaseDocument>(collection: string, id: string): Promise<T | null> {
    return (await this.callRemote('findById', [collection, id])) as T | null;
  }

  /**
   * Insert a single document.
   *
   * @param collection - Collection name
   * @param document - Document to insert (id, createdAt, updatedAt will be added)
   * @returns Inserted document with generated fields
   */
  async insertOne<T extends BaseDocument>(
    collection: string,
    document: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<T> {
    return (await this.callRemote('insertOne', [collection, document])) as T;
  }

  /**
   * Update documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @param update - Update operations
   * @returns Number of documents updated
   */
  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>
  ): Promise<number> {
    return (await this.callRemote('updateMany', [collection, filter, update])) as number;
  }

  /**
   * Update a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @param update - Update operations
   * @returns Updated document or null if not found
   */
  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>
  ): Promise<T | null> {
    return (await this.callRemote('updateById', [collection, id, update])) as T | null;
  }

  /**
   * Delete documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @returns Number of documents deleted
   */
  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>
  ): Promise<number> {
    return (await this.callRemote('deleteMany', [collection, filter])) as number;
  }

  /**
   * Delete a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns True if deleted, false if not found
   */
  async deleteById(collection: string, id: string): Promise<boolean> {
    return (await this.callRemote('deleteById', [collection, id])) as boolean;
  }

  /**
   * Count documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @returns Number of matching documents
   */
  async count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>
  ): Promise<number> {
    return (await this.callRemote('count', [collection, filter])) as number;
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this.callRemote('close', []);
  }
}

/**
 * Create a document database proxy with IPC transport.
 *
 * @param transport - IPC transport to use
 * @returns Document database proxy instance
 *
 * @example
 * ```typescript
 * import { createDocumentDatabaseProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * const transport = createIPCTransport();
 * const db = createDocumentDatabaseProxy(transport);
 * ```
 */
export function createDocumentDatabaseProxy(transport: ITransport): DocumentDatabaseProxy {
  return new DocumentDatabaseProxy(transport);
}
