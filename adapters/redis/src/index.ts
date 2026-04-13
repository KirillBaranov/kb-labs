/**
 * @module @kb-labs/adapters-redis
 * Redis adapter implementing ICache interface.
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-redis';
 *
 * const cache = createAdapter({
 *   host: 'localhost',
 *   port: 6379,
 * });
 *
 * await cache.set('user:123', { name: 'Alice' }, 60000); // TTL 60s
 * const user = await cache.get('user:123');
 * await cache.delete('user:123');
 * await cache.clear('user:*');
 * ```
 */

import Redis, { type RedisOptions } from "ioredis";
import type { ICache } from "@kb-labs/core-platform";

// Re-export manifest
export { manifest } from "./manifest.js";

/**
 * Configuration for Redis cache adapter.
 */
export interface RedisCacheConfig extends RedisOptions {
  /** Redis host (default: 'localhost') */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Key prefix for all cache keys (default: 'kb:') */
  keyPrefix?: string;
}

/**
 * Redis implementation of ICache interface.
 */
export class RedisCacheAdapter implements ICache {
  private client: Redis;
  private keyPrefix: string;

  constructor(config: RedisCacheConfig = {}) {
    this.keyPrefix = config.keyPrefix ?? "kb:";

    this.client = new Redis({
      host: config.host ?? "localhost",
      port: config.port ?? 6379,
      ...config,
      keyPrefix: this.keyPrefix,
    });

    // Prevent unhandled error events from crashing the process on reconnect failures
    this.client.on("error", () => {});
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      // If not JSON, return as-is (cast to T)
      return value as T;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (ttl !== undefined) {
      // TTL in milliseconds, Redis uses seconds
      await this.client.setex(key, Math.ceil(ttl / 1000), serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      // Clear all keys with our prefix
      await this.client.flushdb();
      return;
    }

    // Find keys matching pattern
    const fullPattern = `${this.keyPrefix}${pattern}`;
    const keys = await this.client.keys(fullPattern);

    if (keys.length > 0) {
      // Remove prefix before deleting (ioredis adds it automatically)
      const keysWithoutPrefix = keys.map((k) => k.slice(this.keyPrefix.length));
      await this.client.del(...keysWithoutPrefix);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Sorted Set Operations
  // ═══════════════════════════════════════════════════════════════════════

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<string[]> {
    return this.client.zrangebyscore(key, min, max);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Atomic Operations
  // ═══════════════════════════════════════════════════════════════════════

  async setIfNotExists<T>(
    key: string,
    value: T,
    ttl?: number,
  ): Promise<boolean> {
    const serialized = JSON.stringify(value);

    if (ttl !== undefined) {
      // SET key value PX milliseconds NX
      const result = await this.client.set(key, serialized, "PX", ttl, "NX");
      return result === "OK";
    } else {
      // SET key value NX (no TTL)
      const result = await this.client.set(key, serialized, "NX");
      return result === "OK";
    }
  }

  /**
   * Close Redis connection.
   * Call this on app shutdown.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Create Redis cache adapter.
 * This is the factory function called by initPlatform() when loading adapters.
 */
export function createAdapter(config?: RedisCacheConfig): RedisCacheAdapter {
  return new RedisCacheAdapter(config);
}

// Default export for direct import
export default createAdapter;
// test
