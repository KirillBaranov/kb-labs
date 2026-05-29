/**
 * @module webhook/idempotency-store
 *
 * Deduplication store for webhook deliveries.
 *
 * Uses `cache.setIfNotExists` for atomic check-and-mark — safe under
 * concurrent deliveries of the same event (e.g. retry storms from GitHub).
 *
 * Key format: `webhook:idempotency:{pluginId}:{event}:{deliveryKey}`
 * TTL: 7 days — covers typical webhook retry windows.
 */

import type { ICache } from '@kb-labs/core-platform';

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class WebhookIdempotencyStore {
  constructor(private readonly cache: ICache) {}

  /**
   * Check if this delivery has already been processed, and mark it atomically.
   *
   * @returns `true` if duplicate (already processed), `false` if first time
   */
  async checkAndMark(pluginId: string, event: string, key: string): Promise<boolean> {
    const cacheKey = `webhook:idempotency:${pluginId}:${event}:${key}`;
    const isNew = await this.cache.setIfNotExists(cacheKey, 1, IDEMPOTENCY_TTL_MS);
    return !isNew; // true = duplicate
  }
}
