/**
 * @module @kb-labs/core-platform/noop/adapters/cache
 * In-memory cache implementation.
 */

import type { ICache } from '../../adapters/cache.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

interface SortedSetMember {
  score: number;
  member: string;
}

/**
 * In-memory cache with TTL support.
 * Useful for testing and local development.
 */
export class InMemoryCache implements ICache {
  private store = new Map<string, CacheEntry<unknown>>();
  private sortedSets = new Map<string, SortedSetMember[]>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.store.clear();
      return;
    }

    // Escape regex metacharacters in the literal parts of the pattern, then
    // convert the glob wildcard (*) to a regex wildcard (.*). Without escaping
    // first, a pattern like "user.session:*" would compile to "user.session:.*"
    // where the unescaped dot matches any character, silently deleting keys like
    // "user_session:abc".
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Sorted Set Operations
  // ═══════════════════════════════════════════════════════════════════════

  async zadd(key: string, score: number, member: string): Promise<void> {
    let set = this.sortedSets.get(key);
    if (!set) {
      set = [];
      this.sortedSets.set(key, set);
    }

    // Remove existing member if present
    const existingIndex = set.findIndex(m => m.member === member);
    if (existingIndex !== -1) {
      set.splice(existingIndex, 1);
    }

    // Add new member and sort by score
    set.push({ score, member });
    set.sort((a, b) => a.score - b.score);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const set = this.sortedSets.get(key);
    if (!set) {
      return [];
    }

    return set
      .filter(m => m.score >= min && m.score <= max)
      .map(m => m.member);
  }

  async zrem(key: string, member: string): Promise<void> {
    const set = this.sortedSets.get(key);
    if (!set) {
      return;
    }

    const index = set.findIndex(m => m.member === member);
    if (index !== -1) {
      set.splice(index, 1);
    }

    // Clean up empty sets
    if (set.length === 0) {
      this.sortedSets.delete(key);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Atomic Operations
  // ═══════════════════════════════════════════════════════════════════════

  async setIfNotExists<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    // Use get() instead of store.has() so that expired entries are not treated
    // as live. store.has() returns true for a key even after its TTL has elapsed,
    // while get() evicts the entry and returns null — maintaining atomicity
    // semantics: "set only if the key does not currently resolve to a value".
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return false;
    }

    await this.set(key, value, ttl);
    return true;
  }

  /**
   * Get the current number of entries (for testing).
   */
  get size(): number {
    return this.store.size;
  }
}
