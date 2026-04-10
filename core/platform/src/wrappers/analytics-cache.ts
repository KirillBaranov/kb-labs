/**
 * @module @kb-labs/core-platform/wrappers/analytics-cache
 * Analytics wrapper for ICache that tracks usage
 */

import type { ICache } from '../adapters/cache.js';
import type { IAnalytics } from '../adapters/analytics.js';

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `cache_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Sampling strategy for high-frequency cache operations.
 *
 * - cache.get.hit / cache.set.completed: 1:100 (aggressive sampling for efficiency monitoring)
 * - cache.get.miss: 1:10 (more frequent to detect cache inefficiencies)
 * - cache.zrangebyscore.completed: DISABLED (generates 99% of events, no business value)
 * - cache.*.error: 1:1 (track all errors - important signals)
 * - Other operations: 1:1 (delete, clear, zadd, etc. are rare)
 *
 * Uses deterministic counter-based sampling for even distribution.
 */
let cacheCounter = 0;
function shouldSampleCacheEvent(eventType: string): boolean {
  cacheCounter = (cacheCounter + 1) % 100;

  // High-frequency events (hit/set) - sample 1:100 for efficiency metrics
  if (eventType === 'cache.get.hit' || eventType === 'cache.set.completed') {
    return cacheCounter === 0; // Track every 100th event
  }

  // Miss events - sample 1:10 (more important for detecting cache issues)
  if (eventType === 'cache.get.miss') {
    return cacheCounter % 10 === 0; // Track every 10th miss
  }

  // Track all other events (errors, rare operations)
  return true;
}

/**
 * Time-based sampling for zrangebyscore (scheduler hot path).
 * Tracks last event timestamp per key - only emit 1 event per minute per key.
 * This reduces ~322k events to ~50-100 (based on unique keys).
 */
const lastZrangeTimestamp = new Map<string, number>();
function shouldSampleZrangebyscore(key: string): boolean {
  const now = Date.now();
  const last = lastZrangeTimestamp.get(key) ?? 0;

  // Emit only once per minute for each key
  if (now - last > 60000) {
    lastZrangeTimestamp.set(key, now);
    return true;
  }
  return false;
}

/**
 * Analytics wrapper for cache adapter.
 * Tracks all cache operations including hit/miss rates.
 */
export class AnalyticsCache implements ICache {
  constructor(
    private realCache: ICache,
    private analytics: IAnalytics
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const result = await this.realCache.get<T>(key);
      const durationMs = Date.now() - startTime;
      const hit = result !== null;
      const eventType = hit ? 'cache.get.hit' : 'cache.get.miss';

      // Sample: hit/set 1:100, miss 1:10 (for cache efficiency monitoring)
      if (shouldSampleCacheEvent(eventType)) {
        await this.analytics.track(eventType, {
          requestId,
          key,
          durationMs,
        });
      }

      return result;
    } catch (error) {
      // Always track errors
      await this.analytics.track('cache.get.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realCache.set(key, value, ttl);
      const durationMs = Date.now() - startTime;

      // Sample 1:100 for cache efficiency monitoring
      if (shouldSampleCacheEvent('cache.set.completed')) {
        await this.analytics.track('cache.set.completed', {
          requestId,
          key,
          ttl: ttl ?? null,
          durationMs,
        });
      }
    } catch (error) {
      // Always track errors
      await this.analytics.track('cache.set.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realCache.delete(key);
      const durationMs = Date.now() - startTime;

      // Track delete operation
      await this.analytics.track('cache.delete.completed', {
        requestId,
        key,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('cache.delete.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async clear(pattern?: string): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realCache.clear(pattern);
      const durationMs = Date.now() - startTime;

      // Track clear operation
      await this.analytics.track('cache.clear.completed', {
        requestId,
        pattern: pattern ?? null,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('cache.clear.error', {
        requestId,
        pattern: pattern ?? null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realCache.zadd(key, score, member);
      const durationMs = Date.now() - startTime;

      await this.analytics.track('cache.zadd.completed', {
        requestId,
        key,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('cache.zadd.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const results = await this.realCache.zrangebyscore(key, min, max);
      const durationMs = Date.now() - startTime;

      // DISABLED: zrangebyscore generates 99% of all analytics events (530k/day)
      // This overwhelms FileAnalytics (1.7M events total) causing OOM/timeouts
      // Cache operations are internal and don't provide business value for analytics
      // if (shouldSampleZrangebyscore(key)) {
      //   await this.analytics.track('cache.zrangebyscore.completed', {
      //     requestId,
      //     key,
      //     resultsCount: results.length,
      //     durationMs,
      //   });
      // }

      return results;
    } catch (error) {
      // Always track errors (important signal)
      await this.analytics.track('cache.zrangebyscore.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async zrem(key: string, member: string): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realCache.zrem(key, member);
      const durationMs = Date.now() - startTime;

      await this.analytics.track('cache.zrem.completed', {
        requestId,
        key,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('cache.zrem.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async setIfNotExists<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const result = await this.realCache.setIfNotExists(key, value, ttl);
      const durationMs = Date.now() - startTime;

      await this.analytics.track('cache.setIfNotExists.completed', {
        requestId,
        key,
        success: result,
        ttl: ttl ?? null,
        durationMs,
      });

      return result;
    } catch (error) {
      await this.analytics.track('cache.setIfNotExists.error', {
        requestId,
        key,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }
}
