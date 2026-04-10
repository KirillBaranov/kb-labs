/**
 * @module @kb-labs/core-platform/adapters/cache
 * Cache abstraction for key-value storage with TTL support.
 */

/**
 * Cache adapter interface.
 * Implementations: @kb-labs/core-redis (production), MemoryCache (noop)
 */
export interface ICache {
  /**
   * Get a value from cache.
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache.
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds (optional)
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a value from cache.
   * @param key - Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear cache entries matching a pattern.
   * @param pattern - Glob pattern (e.g., 'user:*')
   */
  clear(pattern?: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════
  // Sorted Set Operations (for scheduling, queues, time-series data)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Add member to sorted set with score.
   * @param key - Sorted set key
   * @param score - Numeric score (typically timestamp)
   * @param member - Member to add
   */
  zadd(key: string, score: number, member: string): Promise<void>;

  /**
   * Get members from sorted set by score range.
   * @param key - Sorted set key
   * @param min - Minimum score (inclusive)
   * @param max - Maximum score (inclusive)
   * @returns Array of members in score order
   */
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;

  /**
   * Remove member from sorted set.
   * @param key - Sorted set key
   * @param member - Member to remove
   */
  zrem(key: string, member: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════════════
  // Atomic Operations (for distributed locking, race-condition prevention)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set key-value pair only if key does not exist (atomic operation).
   * Used for distributed locking and preventing race conditions.
   * @param key - Cache key
   * @param value - Value to set
   * @param ttl - Time to live in milliseconds (optional)
   * @returns true if value was set, false if key already exists
   */
  setIfNotExists<T>(key: string, value: T, ttl?: number): Promise<boolean>;
}
