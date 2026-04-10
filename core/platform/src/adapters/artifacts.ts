/**
 * @module @kb-labs/core-platform/adapters/artifacts
 * Artifact storage interface.
 */

/**
 * Artifact metadata.
 */
export interface ArtifactMeta {
  /** Artifact key/path */
  key: string;
  /** Content type (e.g., 'application/json') */
  contentType?: string;
  /** Size in bytes */
  size?: number;
  /** Creation timestamp */
  createdAt?: Date;
  /** Last modified timestamp */
  updatedAt?: Date;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Artifact write options.
 */
export interface ArtifactWriteOptions {
  /** Content type */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** TTL in seconds (optional expiration) */
  ttl?: number;
}

/**
 * Artifact storage interface.
 * Provides structured storage for plugin outputs.
 */
export interface IArtifacts {
  /**
   * Write an artifact.
   * @param key - Artifact key/path
   * @param data - Data to write (will be serialized)
   * @param options - Write options
   */
  write(
    key: string,
    data: unknown,
    options?: ArtifactWriteOptions,
  ): Promise<void>;

  /**
   * Read an artifact.
   * @param key - Artifact key/path
   * @returns Artifact data or null if not found
   */
  read<T = unknown>(key: string): Promise<T | null>;

  /**
   * Check if artifact exists.
   * @param key - Artifact key/path
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete an artifact.
   * @param key - Artifact key/path
   */
  delete(key: string): Promise<void>;

  /**
   * List artifacts by prefix.
   * @param prefix - Key prefix
   * @returns List of artifact metadata
   */
  list(prefix: string): Promise<ArtifactMeta[]>;

  /**
   * Get artifact metadata.
   * @param key - Artifact key/path
   */
  getMeta(key: string): Promise<ArtifactMeta | null>;
}
