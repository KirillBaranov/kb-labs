/**
 * @module @kb-labs/core-platform/noop/adapters/storage
 * In-memory storage implementation.
 */

import type { IStorage, StorageMetadata } from '../../adapters/storage.js';

/**
 * In-memory storage for testing and local development.
 * Data is lost when the process exits.
 */
interface StorageEntry {
  data: Buffer;
  /** ISO 8601 timestamp of the last write. */
  lastModified: string;
}

export class InMemoryStorage implements IStorage {
  private store = new Map<string, StorageEntry>();

  async read(path: string): Promise<Buffer | null> {
    return this.store.get(path)?.data ?? null;
  }

  async write(path: string, data: Buffer): Promise<void> {
    this.store.set(path, { data, lastModified: new Date().toISOString() });
  }

  async delete(path: string): Promise<void> {
    this.store.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    const results: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        results.push(key);
      }
    }
    return results.sort();
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }

  /**
   * Get file metadata.
   * Optional method - implements IStorage.stat().
   */
  async stat(path: string): Promise<StorageMetadata | null> {
    const entry = this.store.get(path);
    if (!entry) { return null; }

    return {
      path,
      size: entry.data.byteLength,
      lastModified: entry.lastModified,
      contentType: 'application/octet-stream',
    };
  }

  /**
   * Copy file.
   * Optional method - implements IStorage.copy().
   */
  async copy(sourcePath: string, destPath: string): Promise<void> {
    const entry = this.store.get(sourcePath);
    if (!entry) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    // Copy buffer (create new instance); preserve original write time.
    this.store.set(destPath, { data: Buffer.from(entry.data), lastModified: entry.lastModified });
  }

  /**
   * Move file.
   * Optional method - implements IStorage.move().
   */
  async move(sourcePath: string, destPath: string): Promise<void> {
    const entry = this.store.get(sourcePath);
    if (!entry) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }
    this.store.set(destPath, entry);
    this.store.delete(sourcePath);
  }

  /**
   * List files with metadata.
   * Optional method - implements IStorage.listWithMetadata().
   */
  async listWithMetadata(prefix: string): Promise<StorageMetadata[]> {
    const results: StorageMetadata[] = [];
    for (const [path, entry] of this.store.entries()) {
      if (path.startsWith(prefix)) {
        results.push({
          path,
          size: entry.data.byteLength,
          lastModified: entry.lastModified,
          contentType: 'application/octet-stream',
        });
      }
    }
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Get the current number of stored files (for testing).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all storage (for testing).
   */
  clear(): void {
    this.store.clear();
  }
}
