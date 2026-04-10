/**
 * @module @kb-labs/core-runtime/proxy
 * IPC proxy for IStorage adapter.
 *
 * This proxy forwards all storage operations to the parent process via IPC.
 * The parent process owns the real storage adapter (e.g., FilesystemStorageAdapter).
 *
 * Benefits:
 * - Single storage instance (consistent file access across all workers)
 * - Reduced memory usage (no duplicate file handles)
 * - No race conditions (centralized file access)
 *
 * Note: Buffer serialization is handled automatically by the IPC layer.
 *
 * @example
 * ```typescript
 * import { StorageProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * // In child process (sandbox worker)
 * const transport = createIPCTransport();
 * const storage = new StorageProxy(transport);
 *
 * // Use like normal IStorage
 * await storage.write('.kb/data.json', Buffer.from('{"foo":"bar"}'));
 * const data = await storage.read('.kb/data.json');
 * const files = await storage.list('.kb/');
 * ```
 */

import type { IStorage, StorageMetadata } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

/**
 * IPC proxy for IStorage adapter.
 *
 * All method calls are forwarded to the parent process via IPC.
 * The parent process executes the call on the real storage adapter
 * (e.g., FilesystemStorageAdapter) and returns the result.
 *
 * Buffer serialization/deserialization is handled automatically
 * by the IPC serializer (Buffer → base64 → Buffer).
 */
export class StorageProxy extends RemoteAdapter<IStorage> implements IStorage {
  /**
   * Create a storage proxy.
   *
   * @param transport - IPC transport to communicate with parent
   */
  constructor(transport: ITransport) {
    super('storage', transport);
  }

  /**
   * Read file contents.
   *
   * @param path - File path
   * @returns File contents or null if not found
   */
  async read(path: string): Promise<Buffer | null> {
    return (await this.callRemote('read', [path])) as Buffer | null;
  }

  /**
   * Write file contents.
   *
   * @param path - File path
   * @param data - File contents
   */
  async write(path: string, data: Buffer): Promise<void> {
    await this.callRemote('write', [path, data]);
  }

  /**
   * Delete a file.
   *
   * @param path - File path
   */
  async delete(path: string): Promise<void> {
    await this.callRemote('delete', [path]);
  }

  /**
   * List files matching a prefix.
   *
   * @param prefix - Path prefix (e.g., 'docs/')
   * @returns Array of file paths
   */
  async list(prefix: string): Promise<string[]> {
    return (await this.callRemote('list', [prefix])) as string[];
  }

  /**
   * Check if a file exists.
   *
   * @param path - File path
   * @returns True if file exists, false otherwise
   */
  async exists(path: string): Promise<boolean> {
    return (await this.callRemote('exists', [path])) as boolean;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXTENDED METHODS (optional - implements IStorage extended interface)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get file metadata.
   * Optional method - implements IStorage.stat().
   *
   * @param path - File path
   * @returns File metadata or null if not found
   */
  async stat?(path: string): Promise<StorageMetadata | null> {
    return (await this.callRemote('stat', [path])) as StorageMetadata | null;
  }

  /**
   * Copy file within storage.
   * Optional method - implements IStorage.copy().
   *
   * @param sourcePath - Source file path
   * @param destPath - Destination file path
   */
  async copy?(sourcePath: string, destPath: string): Promise<void> {
    await this.callRemote('copy', [sourcePath, destPath]);
  }

  /**
   * Move file within storage.
   * Optional method - implements IStorage.move().
   *
   * @param sourcePath - Source file path
   * @param destPath - Destination file path
   */
  async move?(sourcePath: string, destPath: string): Promise<void> {
    await this.callRemote('move', [sourcePath, destPath]);
  }

  /**
   * List files with metadata.
   * Optional method - implements IStorage.listWithMetadata().
   *
   * @param prefix - Path prefix (e.g., 'docs/')
   * @returns Array of file metadata
   */
  async listWithMetadata?(prefix: string): Promise<StorageMetadata[]> {
    return (await this.callRemote('listWithMetadata', [prefix])) as StorageMetadata[];
  }
}

/**
 * Create a Storage proxy with IPC transport.
 *
 * @param transport - IPC transport to use
 * @returns Storage proxy instance
 *
 * @example
 * ```typescript
 * import { createStorageProxy, createIPCTransport } from '@kb-labs/core-runtime';
 *
 * const transport = createIPCTransport();
 * const storage = createStorageProxy(transport);
 * ```
 */
export function createStorageProxy(transport: ITransport): StorageProxy {
  return new StorageProxy(transport);
}
