/**
 * @module @kb-labs/adapters-fs/secure-storage
 * SecureStorageAdapter - IStorage wrapper with permission validation.
 *
 * Design Philosophy: Validation-only security (like fs-shim)
 * - Validates paths against allowlists/denylists
 * - Does NOT rewrite paths or queries
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-fs';
 * import { SecureStorageAdapter } from '@kb-labs/adapters-fs/secure-storage';
 *
 * const base = createAdapter({ baseDir: '/var/data' });
 * const secure = new SecureStorageAdapter(base, {
 *   allowlist: ['docs/', 'uploads/'],
 *   denylist: ['uploads/private/'],
 * });
 *
 * await secure.write('docs/readme.md', Buffer.from('# Hello')); // ✅ Allowed
 * await secure.write('config/secrets.json', Buffer.from('{}')); // ❌ Denied
 * ```
 */

import type {
  IStorage,
  StorageMetadata,
} from "@kb-labs/core-platform/adapters";

/**
 * Permission configuration for storage access.
 */
export interface StoragePermissions {
  /**
   * Allowed path prefixes (e.g., ['docs/', 'uploads/']).
   * If empty or undefined, all paths are allowed (unless denied).
   */
  allowlist?: string[];

  /**
   * Denied path prefixes (e.g., ['config/', 'secrets/']).
   * Takes precedence over allowlist.
   */
  denylist?: string[];

  /**
   * Allow read operations (default: true)
   */
  read?: boolean;

  /**
   * Allow write operations (default: true)
   */
  write?: boolean;

  /**
   * Allow delete operations (default: false - safer default)
   */
  delete?: boolean;
}

/**
 * Error thrown when storage access is denied.
 */
export class StoragePermissionError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`Storage access denied: ${operation} ${path} - ${reason}`);
    this.name = "StoragePermissionError";
  }
}

/**
 * SecureStorageAdapter - validates permissions before delegating to base storage.
 *
 * Design:
 * - Validation-only (no path rewriting)
 * - Fails fast with clear errors
 * - Transparent pass-through when permitted
 * - Supports both coarse (read/write/delete) and fine (path-based) permissions
 */
export class SecureStorageAdapter implements IStorage {
  constructor(
    private readonly baseStorage: IStorage,
    private readonly permissions: StoragePermissions,
  ) {}

  /**
   * Check if a path is allowed by permissions.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Security-critical permission check with denylist/allowlist logic
  private checkPath(
    path: string,
    operation: "read" | "write" | "delete",
  ): void {
    // Check operation-level permissions
    const operationAllowed = this.permissions[operation] !== false;
    if (!operationAllowed) {
      throw new StoragePermissionError(
        operation,
        path,
        `${operation} operations are disabled`,
      );
    }

    // Check denylist first (takes precedence)
    if (this.permissions.denylist) {
      for (const denied of this.permissions.denylist) {
        if (path.startsWith(denied)) {
          throw new StoragePermissionError(
            operation,
            path,
            `path matches denylist: ${denied}`,
          );
        }
      }
    }

    // Check allowlist (if defined)
    if (this.permissions.allowlist && this.permissions.allowlist.length > 0) {
      let allowed = false;
      for (const prefix of this.permissions.allowlist) {
        if (path.startsWith(prefix)) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        throw new StoragePermissionError(
          operation,
          path,
          `path not in allowlist: [${this.permissions.allowlist.join(", ")}]`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Core IStorage methods (required)
  // ═══════════════════════════════════════════════════════════════════════

  async read(path: string): Promise<Buffer | null> {
    this.checkPath(path, "read");
    return this.baseStorage.read(path);
  }

  async write(path: string, data: Buffer): Promise<void> {
    this.checkPath(path, "write");
    await this.baseStorage.write(path, data);
  }

  async delete(path: string): Promise<void> {
    this.checkPath(path, "delete");
    await this.baseStorage.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    this.checkPath(prefix, "read");
    const files = await this.baseStorage.list(prefix);

    // Filter results by permissions (double-check each file)
    return files.filter((file) => {
      try {
        this.checkPath(file, "read");
        return true;
      } catch {
        return false; // Silently exclude files that don't pass permission check
      }
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      this.checkPath(path, "read");
      return await this.baseStorage.exists(path);
    } catch (error) {
      if (error instanceof StoragePermissionError) {
        return false; // Treat permission denied as "not exists" for safety
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Extended IStorage methods (optional)
  // ═══════════════════════════════════════════════════════════════════════

  async stat?(path: string): Promise<StorageMetadata | null> {
    if (!this.baseStorage.stat) {
      return null;
    }

    this.checkPath(path, "read");
    return this.baseStorage.stat(path);
  }

  async copy?(sourcePath: string, destPath: string): Promise<void> {
    if (!this.baseStorage.copy) {
      throw new Error("copy() not supported by base storage adapter");
    }

    this.checkPath(sourcePath, "read");
    this.checkPath(destPath, "write");
    await this.baseStorage.copy(sourcePath, destPath);
  }

  async move?(sourcePath: string, destPath: string): Promise<void> {
    if (!this.baseStorage.move) {
      throw new Error("move() not supported by base storage adapter");
    }

    this.checkPath(sourcePath, "read");
    this.checkPath(sourcePath, "delete"); // Move = read + delete source
    this.checkPath(destPath, "write");
    await this.baseStorage.move(sourcePath, destPath);
  }

  async listWithMetadata?(prefix: string): Promise<StorageMetadata[]> {
    if (!this.baseStorage.listWithMetadata) {
      return [];
    }

    this.checkPath(prefix, "read");
    const files = await this.baseStorage.listWithMetadata(prefix);

    // Filter results by permissions (double-check each file)
    return files.filter((file) => {
      try {
        this.checkPath(file.path, "read");
        return true;
      } catch {
        return false; // Silently exclude files that don't pass permission check
      }
    });
  }
}

/**
 * Create secure storage adapter with permission validation.
 *
 * @param baseStorage - Base storage adapter (filesystem, S3, etc.)
 * @param permissions - Permission configuration
 * @returns Wrapped storage adapter with permission checks
 *
 * @example
 * ```typescript
 * const secure = createSecureStorage(base, {
 *   allowlist: ['docs/', 'uploads/'],
 *   denylist: ['uploads/private/'],
 *   delete: false, // Prevent deletions
 * });
 * ```
 */
export function createSecureStorage(
  baseStorage: IStorage,
  permissions: StoragePermissions,
): SecureStorageAdapter {
  return new SecureStorageAdapter(baseStorage, permissions);
}

// Default export for direct import
export default createSecureStorage;
