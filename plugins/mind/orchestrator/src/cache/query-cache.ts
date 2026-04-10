/**
 * Query Cache
 *
 * LRU cache for repeated queries to reduce LLM calls
 * and improve response times.
 *
 * Supports optional StateBroker backend for persistent cross-invocation caching.
 */

import { createHash } from 'node:crypto';
import type { AgentQueryMode, AgentResponse } from '../types';

export interface CacheEntry {
  response: AgentResponse;
  timestamp: number;
  hits: number;
  queryHash: string;
  scopeId: string;
  mode: AgentQueryMode;
  indexRevision: string;
  engineConfigHash: string;
  sourcesDigest?: string;
}

export interface StateBrokerLike {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface QueryCacheOptions {
  /** Maximum cache entries (for in-memory fallback) */
  maxSize?: number;
  /** Default TTL in milliseconds */
  defaultTtlMs?: number;
  /** TTL by mode (more complex modes cache longer) */
  ttlByMode?: Record<AgentQueryMode, number>;
  /** Optional state broker for persistent caching */
  broker?: StateBrokerLike;
}

const DEFAULT_OPTIONS = {
  maxSize: 100,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  ttlByMode: {
    instant: 2 * 60 * 1000,   // 2 minutes
    auto: 5 * 60 * 1000,      // 5 minutes
    thinking: 15 * 60 * 1000, // 15 minutes
  },
};

const BROKER_QUERY_PREFIX = 'mind:query:entry:';
const BROKER_SCOPE_PREFIX = 'mind:query:scope:';
const BROKER_SCOPES_KEY = 'mind:query:scopes';

/**
 * Query Cache - LRU cache for agent responses
 *
 * Two-tier caching strategy:
 * 1. StateBroker (persistent, cross-invocation) - if available
 * 2. In-memory LRU (fallback) - always available
 */
export class QueryCache {
  private readonly options: Required<Omit<QueryCacheOptions, 'broker'>>;
  private readonly broker?: StateBrokerLike;
  private readonly cache: Map<string, CacheEntry>;
  private readonly accessOrder: string[];
  private readonly scopeIndex: Map<string, Set<string>>;

  constructor(options: QueryCacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.broker = options.broker;
    this.cache = new Map();
    this.accessOrder = [];
    this.scopeIndex = new Map();
  }

  /**
   * Generate cache key from query parameters
   */
  private generateKey(
    query: string,
    scopeId: string,
    mode: AgentQueryMode,
    indexRevision: string,
    engineConfigHash: string,
    sourcesDigest?: string,
  ): string {
    const normalized = query.toLowerCase().trim();
    return createHash('sha256')
      .update(`${scopeId}:${mode}:${normalized}:${indexRevision}:${engineConfigHash}:${sourcesDigest ?? '-'}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get cached response if available and not expired
   */
  async get(
    query: string,
    scopeId: string,
    mode: AgentQueryMode,
    indexRevision: string,
    engineConfigHash: string,
    sourcesDigest?: string,
  ): Promise<AgentResponse | null> {
    const key = this.generateKey(
      query,
      scopeId,
      mode,
      indexRevision,
      engineConfigHash,
      sourcesDigest,
    );
    const ttl = this.options.ttlByMode[mode] ?? this.options.defaultTtlMs;

    // Try StateBroker first (persistent cache)
    if (this.broker) {
      try {
        const brokerKey = this.brokerEntryKey(key);
        const entry = await this.broker.get<CacheEntry>(brokerKey);

        if (entry) {
          // Check TTL
          const age = Date.now() - entry.timestamp;
          if (age <= ttl) {
            // Cache hit
            return {
              ...entry.response,
              meta: {
                ...entry.response.meta,
                cached: true,
              },
            };
          }
        }
      } catch (error) {
        // Fallback to in-memory if broker fails
      }
    }

    // Fallback to in-memory cache
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;

    if (age > ttl) {
      const staleEntry = this.cache.get(key);
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      if (staleEntry) {
        this.removeFromScopeIndex(staleEntry.scopeId, key);
      }
      return null;
    }

    // Update access order (LRU)
    this.updateAccessOrder(key);
    entry.hits++;

    // Return cached response with updated meta
    return {
      ...entry.response,
      meta: {
        ...entry.response.meta,
        cached: true,
      },
    };
  }

  /**
   * Store response in cache
   */
  async set(
    query: string,
    scopeId: string,
    mode: AgentQueryMode,
    indexRevision: string,
    engineConfigHash: string,
    sourcesDigest: string | undefined,
    response: AgentResponse,
  ): Promise<void> {
    // Don't cache error responses or low confidence
    if (response.confidence < 0.3) {
      return;
    }

    const key = this.generateKey(
      query,
      scopeId,
      mode,
      indexRevision,
      engineConfigHash,
      sourcesDigest,
    );
    const ttl = this.options.ttlByMode[mode] ?? this.options.defaultTtlMs;

    const entry: CacheEntry = {
      response,
      timestamp: Date.now(),
      hits: 0,
      queryHash: key,
      scopeId,
      mode,
      indexRevision,
      engineConfigHash,
      sourcesDigest,
    };

    // Store in StateBroker first (persistent cache)
    if (this.broker) {
      try {
        const brokerKey = this.brokerEntryKey(key);
        await this.broker.set(brokerKey, entry, ttl);
        await this.addBrokerScopeKey(scopeId, key);
      } catch (error) {
        // Fallback to in-memory if broker fails
      }
    }

    // Always store in in-memory cache too (L2 cache)
    // Evict if at capacity
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.addToScopeIndex(scopeId, key);
  }

  /**
   * Invalidate cache for a scope (e.g., after re-indexing)
   */
  async invalidateScope(scopeId: string): Promise<number> {
    let invalidated = 0;
    const indexedKeys = this.scopeIndex.get(scopeId);
    const keysToDelete = indexedKeys ? Array.from(indexedKeys) : [];

    if (!indexedKeys) {
      for (const [key, entry] of this.cache) {
        if (entry.scopeId === scopeId) {
          keysToDelete.push(key);
        }
      }
    }

    for (const key of keysToDelete) {
      if (this.cache.delete(key)) {
        invalidated++;
      }
      this.removeFromAccessOrder(key);
    }
    this.scopeIndex.delete(scopeId);

    if (this.broker) {
      invalidated += await this.invalidateBrokerScope(scopeId);
    }

    return invalidated;
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<number> {
    const invalidated = this.cache.size;
    this.cache.clear();
    this.accessOrder.length = 0;
    this.scopeIndex.clear();

    if (this.broker) {
      await this.clearBrokerCache();
    }
    return invalidated;
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ queryHash: string; hits: number; age: number }>;
  } {
    const now = Date.now();
    let totalHits = 0;

    const entries = Array.from(this.cache.entries()).map(([key, entry]) => {
      totalHits += entry.hits;
      return {
        queryHash: key,
        hits: entry.hits,
        age: now - entry.timestamp,
      };
    });

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate: entries.length > 0 ? totalHits / entries.length : 0,
      entries,
    };
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      const entry = this.cache.get(lruKey);
      this.cache.delete(lruKey);
      if (entry) {
        this.removeFromScopeIndex(entry.scopeId, lruKey);
      }
    }
  }

  private addToScopeIndex(scopeId: string, key: string): void {
    const existing = this.scopeIndex.get(scopeId);
    if (existing) {
      existing.add(key);
      return;
    }
    this.scopeIndex.set(scopeId, new Set([key]));
  }

  private removeFromScopeIndex(scopeId: string, key: string): void {
    const existing = this.scopeIndex.get(scopeId);
    if (!existing) {
      return;
    }
    existing.delete(key);
    if (existing.size === 0) {
      this.scopeIndex.delete(scopeId);
    }
  }

  private brokerEntryKey(key: string): string {
    return `${BROKER_QUERY_PREFIX}${key}`;
  }

  private brokerScopeKey(scopeId: string): string {
    return `${BROKER_SCOPE_PREFIX}${scopeId}`;
  }

  private async addBrokerScopeKey(scopeId: string, key: string): Promise<void> {
    if (!this.broker) {
      return;
    }
    const scopeKey = this.brokerScopeKey(scopeId);
    const existing = (await this.broker.get<string[]>(scopeKey)) ?? [];
    if (!existing.includes(key)) {
      existing.push(key);
      await this.broker.set(scopeKey, existing);
    }

    const scopes = (await this.broker.get<string[]>(BROKER_SCOPES_KEY)) ?? [];
    if (!scopes.includes(scopeId)) {
      scopes.push(scopeId);
      await this.broker.set(BROKER_SCOPES_KEY, scopes);
    }
  }

  private async invalidateBrokerScope(scopeId: string): Promise<number> {
    if (!this.broker) {
      return 0;
    }
    const scopeKey = this.brokerScopeKey(scopeId);
    const keys = (await this.broker.get<string[]>(scopeKey)) ?? [];
    let invalidated = 0;
    for (const key of keys) {
      await this.broker.delete(this.brokerEntryKey(key));
      invalidated++;
    }
    await this.broker.delete(scopeKey);

    const scopes = (await this.broker.get<string[]>(BROKER_SCOPES_KEY)) ?? [];
    const nextScopes = scopes.filter((value) => value !== scopeId);
    await this.broker.set(BROKER_SCOPES_KEY, nextScopes);
    return invalidated;
  }

  private async clearBrokerCache(): Promise<void> {
    if (!this.broker) {
      return;
    }
    const scopes = (await this.broker.get<string[]>(BROKER_SCOPES_KEY)) ?? [];
    for (const scopeId of scopes) {
      await this.invalidateBrokerScope(scopeId);
    }
    await this.broker.delete(BROKER_SCOPES_KEY);
  }
}

/**
 * Create a query cache instance
 */
export function createQueryCache(options?: QueryCacheOptions): QueryCache {
  return new QueryCache(options);
}

/**
 * Generate a query hash for external use
 */
export function hashQuery(
  query: string,
  scopeId: string,
  mode: AgentQueryMode,
): string {
  const normalized = query.toLowerCase().trim();
  return createHash('sha256')
    .update(`${scopeId}:${mode}:${normalized}`)
    .digest('hex')
    .substring(0, 16);
}
