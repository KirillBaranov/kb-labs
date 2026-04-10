/**
 * @module @kb-labs/core-platform/noop/adapters/artifacts
 * In-memory implementation of IArtifacts.
 */

import type {
  IArtifacts,
  ArtifactMeta,
  ArtifactWriteOptions,
} from '../../adapters/artifacts.js';

/**
 * In-memory artifacts storage.
 * Useful for testing and development.
 */
export class MemoryArtifacts implements IArtifacts {
  private store = new Map<string, { data: unknown; meta: ArtifactMeta }>();

  async write(
    key: string,
    data: unknown,
    options?: ArtifactWriteOptions
  ): Promise<void> {
    const now = new Date();
    const meta: ArtifactMeta = {
      key,
      contentType: options?.contentType ?? 'application/json',
      size: JSON.stringify(data).length,
      createdAt: this.store.get(key)?.meta.createdAt ?? now,
      updatedAt: now,
      metadata: options?.metadata,
    };
    this.store.set(key, { data, meta });
  }

  async read<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    return entry ? (entry.data as T) : null;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<ArtifactMeta[]> {
    const results: ArtifactMeta[] = [];
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) {
        results.push(entry.meta);
      }
    }
    return results;
  }

  async getMeta(key: string): Promise<ArtifactMeta | null> {
    const entry = this.store.get(key);
    return entry?.meta ?? null;
  }
}
