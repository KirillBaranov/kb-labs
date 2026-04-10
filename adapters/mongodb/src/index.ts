/**
 * @module @kb-labs/adapters-mongodb
 * MongoDB adapter implementing IDocumentDatabase interface.
 *
 * Features:
 * - Based on official MongoDB Node.js driver
 * - Connection pooling (automatic)
 * - Type-safe document operations
 * - Query operators ($eq, $ne, $gt, etc.)
 * - Projection and sorting support
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-mongodb';
 *
 * const db = createAdapter({
 *   uri: 'mongodb://localhost:27017',
 *   database: 'myapp',
 * });
 *
 * // Find documents
 * const users = await db.find('users', { age: { $gt: 18 } }, { limit: 10 });
 *
 * // Insert document
 * await db.insertOne('users', { name: 'Alice', age: 25 });
 *
 * // Update documents
 * await db.updateMany('users', { age: { $lt: 18 } }, { $set: { minor: true } });
 *
 * // Close connection
 * await db.close();
 * ```
 */

import { randomUUID } from "node:crypto";
import { MongoClient, type Db, type Collection } from "mongodb";
import type {
  IDocumentDatabase,
  BaseDocument,
  DocumentFilter,
  DocumentUpdate,
  FindOptions,
} from "@kb-labs/core-platform/adapters";

// Re-export manifest
export { manifest } from "./manifest.js";

/**
 * Configuration for MongoDB adapter.
 */
export interface MongoDBConfig {
  /**
   * MongoDB connection URI.
   * @example 'mongodb://localhost:27017'
   * @example 'mongodb+srv://user:pass@cluster.mongodb.net'
   */
  uri: string;

  /**
   * Database name.
   */
  database: string;

  /**
   * Connection options (optional).
   */
  options?: {
    /** Max pool size (default: 10) */
    maxPoolSize?: number;
    /** Server selection timeout in ms (default: 30000) */
    serverSelectionTimeoutMS?: number;
  };
}

/**
 * MongoDB implementation of IDocumentDatabase interface.
 *
 * Design:
 * - Uses official MongoDB Node.js driver
 * - Connection pooling handled automatically
 * - Type-safe operations with generics
 * - Maps MongoDB operators to DocumentFilter format
 */
export class MongoDBAdapter implements IDocumentDatabase {
  private client: MongoClient;
  private db: Db;
  private closed = false;

  constructor(private config: MongoDBConfig) {
    this.client = new MongoClient(config.uri, {
      maxPoolSize: config.options?.maxPoolSize ?? 10,
      serverSelectionTimeoutMS:
        config.options?.serverSelectionTimeoutMS ?? 30000,
    });

    // Will connect lazily on first operation
    this.db = this.client.db(config.database);
  }

  /**
   * Ensure connection is established.
   */
  private async ensureConnected(): Promise<void> {
    if (this.closed) {
      throw new Error("Database connection is closed");
    }

    // MongoDB driver connects lazily, but we can trigger it explicitly
    await this.client.connect();
  }

  /**
   * Get collection reference.
   */
  private getCollection<T extends BaseDocument>(
    collection: string,
  ): Collection<T> {
    return this.db.collection<T>(collection);
  }

  /**
   * Find documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @param options - Find options (limit, skip, sort, projection)
   * @returns Array of matching documents
   */
  async find<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions,
  ): Promise<T[]> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    let cursor = col.find(filter as any);

    // Apply options
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }
    if (options?.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options?.sort) {
      cursor = cursor.sort(options.sort as any);
    }

    return cursor.toArray() as Promise<T[]>;
  }

  /**
   * Find a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns Document or null if not found
   */
  async findById<T extends BaseDocument>(
    collection: string,
    id: string,
  ): Promise<T | null> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    const doc = await col.findOne({ _id: id } as any);

    return doc as T | null;
  }

  /**
   * Insert a single document.
   *
   * @param collection - Collection name
   * @param document - Document to insert
   * @returns Inserted document with generated fields
   */
  async insertOne<T extends BaseDocument>(
    collection: string,
    document: Omit<T, "id" | "createdAt" | "updatedAt">,
  ): Promise<T> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);

    // Add generated fields (timestamps are Unix timestamps in milliseconds)
    const now = Date.now();
    const docWithMeta = {
      ...document,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(docWithMeta as any);

    return docWithMeta as T;
  }

  /**
   * Insert multiple documents.
   *
   * @param collection - Collection name
   * @param documents - Documents to insert
   * @returns Array of inserted document IDs
   */
  async insertMany<T extends BaseDocument>(
    collection: string,
    documents: Array<Omit<T, "_id">>,
  ): Promise<string[]> {
    await this.ensureConnected();

    if (documents.length === 0) {
      return [];
    }

    const col = this.getCollection<T>(collection);
    const result = await col.insertMany(documents as any);

    return Object.values(result.insertedIds).map(String);
  }

  /**
   * Update a single document.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @param update - Update operations
   * @returns Number of documents modified
   */
  async updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    const result = await col.updateOne(filter as any, update as any);

    return result.modifiedCount;
  }

  /**
   * Update multiple documents.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @param update - Update operations
   * @returns Number of documents modified
   */
  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    const result = await col.updateMany(filter as any, update as any);

    return result.modifiedCount;
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
    update: DocumentUpdate<T>,
  ): Promise<T | null> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);

    // findOneAndUpdate returns the updated document
    const result = await col.findOneAndUpdate(
      { id } as any,
      {
        ...update,
        $set: { ...((update as any).$set || {}), updatedAt: Date.now() },
      } as any,
      { returnDocument: "after" },
    );

    return result as T | null;
  }

  /**
   * Delete a single document.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @returns Number of documents deleted
   */
  async deleteOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    const result = await col.deleteOne(filter as any);

    return result.deletedCount ?? 0;
  }

  /**
   * Delete multiple documents.
   *
   * @param collection - Collection name
   * @param filter - Query filter
   * @returns Number of documents deleted
   */
  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    const result = await col.deleteMany(filter as any);

    return result.deletedCount ?? 0;
  }

  /**
   * Delete a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns True if deleted, false if not found
   */
  async deleteById(collection: string, id: string): Promise<boolean> {
    await this.ensureConnected();

    const col = this.getCollection(collection);
    const result = await col.deleteOne({ id } as any);

    return (result.deletedCount ?? 0) > 0;
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
    filter: DocumentFilter<T>,
  ): Promise<number> {
    await this.ensureConnected();

    const col = this.getCollection<T>(collection);
    return col.countDocuments(filter as any);
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    if (!this.closed) {
      await this.client.close();
      this.closed = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility methods (not part of IDocumentDatabase interface)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check if database is open.
   */
  isOpen(): boolean {
    return !this.closed;
  }

  /**
   * Get underlying MongoDB client (for advanced usage).
   * Use with caution - bypasses adapter interface.
   */
  getRawClient(): MongoClient {
    return this.client;
  }

  /**
   * Get underlying MongoDB Db instance (for advanced usage).
   * Use with caution - bypasses adapter interface.
   */
  getRawDatabase(): Db {
    return this.db;
  }
}

/**
 * Create MongoDB database adapter.
 * This is the factory function called by initPlatform() when loading adapters.
 *
 * @param config - MongoDB configuration
 * @returns MongoDB adapter instance
 *
 * @example
 * ```typescript
 * const db = createAdapter({
 *   uri: 'mongodb://localhost:27017',
 *   database: 'myapp',
 *   options: {
 *     maxPoolSize: 20,
 *   },
 * });
 * ```
 */
export function createAdapter(config: MongoDBConfig): MongoDBAdapter {
  return new MongoDBAdapter(config);
}

// Default export for direct import
export default createAdapter;
