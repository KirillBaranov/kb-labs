/**
 * @module @kb-labs/adapters-mongodb/secure-document
 * SecureDocumentAdapter - IDocumentDatabase wrapper with permission validation.
 *
 * Design Philosophy: Validation-only security (like fs-shim)
 * - Validates collection access against allowlists/denylists
 * - Does NOT rewrite queries or filters
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-mongodb';
 * import { SecureDocumentAdapter } from '@kb-labs/adapters-mongodb/secure-document';
 *
 * const base = createAdapter({ uri: 'mongodb://localhost:27017', database: 'myapp' });
 * const secure = new SecureDocumentAdapter(base, {
 *   allowlist: ['users', 'posts', 'comments'],
 *   denylist: ['admin_users', 'secrets'],
 * });
 *
 * await secure.find('users', { age: { $gt: 18 } }); // ✅ Allowed
 * await secure.find('admin_users', {}); // ❌ Denied
 * ```
 */

import type {
  IDocumentDatabase,
  BaseDocument,
  DocumentFilter,
  DocumentUpdate,
  FindOptions,
} from "@kb-labs/core-platform/adapters";

/**
 * Permission configuration for document database access.
 */
export interface DocumentPermissions {
  /**
   * Allowed collection names (e.g., ['users', 'posts']).
   * If empty or undefined, all collections are allowed (unless denied).
   */
  allowlist?: string[];

  /**
   * Denied collection names (e.g., ['admin_users', 'secrets']).
   * Takes precedence over allowlist.
   */
  denylist?: string[];

  /**
   * Allow read operations (find, findById, count) (default: true)
   */
  read?: boolean;

  /**
   * Allow write operations (insert, update) (default: true)
   */
  write?: boolean;

  /**
   * Allow delete operations (deleteOne, deleteMany) (default: false - safer default)
   */
  delete?: boolean;
}

/**
 * Error thrown when document database access is denied.
 */
export class DocumentPermissionError extends Error {
  constructor(
    public readonly operation: string,
    public readonly collection: string,
    public readonly reason: string,
  ) {
    super(
      `Document database access denied: ${operation} on '${collection}' - ${reason}`,
    );
    this.name = "DocumentPermissionError";
  }
}

/**
 * SecureDocumentAdapter - validates permissions before delegating to base database.
 *
 * Design:
 * - Validation-only (no query rewriting)
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 * - Supports both coarse (read/write/delete) and fine (collection-based) permissions
 */
export class SecureDocumentAdapter implements IDocumentDatabase {
  constructor(
    private readonly baseDb: IDocumentDatabase,
    private readonly permissions: DocumentPermissions,
  ) {}

  /**
   * Check if a collection is allowed by permissions.
   */
  private checkCollection(
    collection: string,
    operation: "read" | "write" | "delete",
  ): void {
    // Check operation-level permissions
    const operationAllowed = this.permissions[operation] !== false;
    if (!operationAllowed) {
      throw new DocumentPermissionError(
        operation,
        collection,
        `${operation} operations are disabled`,
      );
    }

    // Check denylist first (takes precedence)
    if (this.permissions.denylist?.includes(collection)) {
      throw new DocumentPermissionError(
        operation,
        collection,
        `collection is in denylist`,
      );
    }

    // Check allowlist (if defined)
    if (this.permissions.allowlist && this.permissions.allowlist.length > 0 && !this.permissions.allowlist.includes(collection)) {
      throw new DocumentPermissionError(
        operation,
        collection,
        `collection not in allowlist: [${this.permissions.allowlist.join(", ")}]`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IDocumentDatabase methods with permission checks
  // ═══════════════════════════════════════════════════════════════════════

  async find<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions,
  ): Promise<T[]> {
    this.checkCollection(collection, "read");
    return this.baseDb.find<T>(collection, filter, options);
  }

  async findById<T extends BaseDocument>(
    collection: string,
    id: string,
  ): Promise<T | null> {
    this.checkCollection(collection, "read");
    return this.baseDb.findById<T>(collection, id);
  }

  async insertOne<T extends BaseDocument>(
    collection: string,
    document: Omit<T, "id" | "createdAt" | "updatedAt">,
  ): Promise<T> {
    this.checkCollection(collection, "write");
    return this.baseDb.insertOne<T>(collection, document);
  }

  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number> {
    this.checkCollection(collection, "write");
    return this.baseDb.updateMany<T>(collection, filter, update);
  }

  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
  ): Promise<T | null> {
    this.checkCollection(collection, "write");
    return this.baseDb.updateById<T>(collection, id, update);
  }

  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    this.checkCollection(collection, "delete");
    return this.baseDb.deleteMany<T>(collection, filter);
  }

  async deleteById(collection: string, id: string): Promise<boolean> {
    this.checkCollection(collection, "delete");
    return this.baseDb.deleteById(collection, id);
  }

  async count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    this.checkCollection(collection, "read");
    return this.baseDb.count<T>(collection, filter);
  }

  async close(): Promise<void> {
    await this.baseDb.close();
  }
}

/**
 * Create secure document adapter with permission validation.
 *
 * @param baseDb - Base document adapter (MongoDB, etc.)
 * @param permissions - Permission configuration
 * @returns Wrapped document adapter with permission checks
 *
 * @example
 * ```typescript
 * const secure = createSecureDocument(base, {
 *   allowlist: ['users', 'posts'],
 *   denylist: ['admin_users'],
 *   delete: false, // Prevent deletions
 * });
 * ```
 */
export function createSecureDocument(
  baseDb: IDocumentDatabase,
  permissions: DocumentPermissions,
): SecureDocumentAdapter {
  return new SecureDocumentAdapter(baseDb, permissions);
}

// Default export for direct import
export default createSecureDocument;
