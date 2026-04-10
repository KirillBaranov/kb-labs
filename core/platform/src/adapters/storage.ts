/**
 * @module @kb-labs/core-platform/adapters/storage
 * Storage abstraction for file/blob operations.
 */

/**
 * Metadata for storage objects.
 * Used by listWithMetadata() and stat().
 */
export interface StorageMetadata {
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (ISO 8601) */
  lastModified: string;
  /** Content type (MIME) - optional */
  contentType?: string;
  /** ETag for versioning - optional */
  etag?: string;
}

/**
 * Storage adapter interface.
 * Implementations: @kb-labs/core-fs (production), MemoryStorage (noop)
 *
 * **Backward compatibility:**
 * - Core methods (read, write, delete, list, exists) are required
 * - Extended methods (readStream, writeStream, copy, move, listWithMetadata, stat) are optional
 * - Adapters can implement extended methods for better performance
 */
export interface IStorage {
  // ============================================================================
  // CORE METHODS (required)
  // ============================================================================

  /**
   * Read file contents.
   * @param path - File path
   * @returns File contents or null if not found
   */
  read(path: string): Promise<Buffer | null>;

  /**
   * Write file contents.
   * @param path - File path
   * @param data - File contents
   */
  write(path: string, data: Buffer): Promise<void>;

  /**
   * Delete a file.
   * @param path - File path
   */
  delete(path: string): Promise<void>;

  /**
   * List files matching a prefix.
   * @param prefix - Path prefix (e.g., 'docs/')
   * @returns Array of file paths
   */
  list(prefix: string): Promise<string[]>;

  /**
   * Check if a file exists.
   * @param path - File path
   */
  exists(path: string): Promise<boolean>;

  // ============================================================================
  // EXTENDED METHODS (optional - for backward compatibility)
  // ============================================================================

  /**
   * Read file as stream (for large files).
   * @param path - File path
   * @returns Readable stream or null if not found
   *
   * **Optional:** If not implemented, runtime will fallback to read() + buffer wrapping.
   */
  readStream?(path: string): Promise<NodeJS.ReadableStream | null>;

  /**
   * Write file from stream (for large files).
   * @param path - File path
   * @param stream - Readable stream
   *
   * **Optional:** If not implemented, runtime will fallback to stream → buffer → write().
   */
  writeStream?(path: string, stream: NodeJS.ReadableStream): Promise<void>;

  /**
   * Copy file within storage.
   * @param sourcePath - Source file path
   * @param destPath - Destination file path
   *
   * **Optional:** If not implemented, runtime will fallback to read() + write().
   */
  copy?(sourcePath: string, destPath: string): Promise<void>;

  /**
   * Move file within storage.
   * @param sourcePath - Source file path
   * @param destPath - Destination file path
   *
   * **Optional:** If not implemented, runtime will fallback to copy() + delete().
   */
  move?(sourcePath: string, destPath: string): Promise<void>;

  /**
   * List files with metadata (size, lastModified, etc).
   * @param prefix - Path prefix (e.g., 'docs/')
   * @returns Array of file metadata
   *
   * **Optional:** If not implemented, runtime will fallback to list() + stat() for each file.
   */
  listWithMetadata?(prefix: string): Promise<StorageMetadata[]>;

  /**
   * Get file metadata without reading contents.
   * @param path - File path
   * @returns File metadata or null if not found
   *
   * **Optional:** If not implemented, runtime will fallback to exists() + read() (inefficient).
   */
  stat?(path: string): Promise<StorageMetadata | null>;
}
