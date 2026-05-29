/**
 * Unit tests for WebhookIdempotencyStore.
 *
 * Validates atomic deduplication via cache.setIfNotExists.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookIdempotencyStore } from '../webhook/idempotency-store.js';

describe('WebhookIdempotencyStore', () => {
  let cache: InMemoryCache;
  let store: WebhookIdempotencyStore;

  beforeEach(() => {
    cache = new InMemoryCache();
    store = new WebhookIdempotencyStore(cache);
  });

  it('first delivery: returns false (not duplicate)', async () => {
    const isDuplicate = await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-001');
    expect(isDuplicate).toBe(false);
  });

  it('second delivery with same key: returns true (duplicate)', async () => {
    await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-001');
    const isDuplicate = await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-001');
    expect(isDuplicate).toBe(true);
  });

  it('different delivery keys are independent', async () => {
    await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-001');
    const isDuplicate = await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-002');
    expect(isDuplicate).toBe(false);
  });

  it('different events are isolated (same key, different event)', async () => {
    await store.checkAndMark('ns-test', '@kb-labs/plugin', 'alert', 'delivery-001');
    const isDuplicate = await store.checkAndMark('ns-test', '@kb-labs/plugin', 'push', 'delivery-001');
    expect(isDuplicate).toBe(false);
  });

  it('different pluginIds are isolated', async () => {
    await store.checkAndMark('ns-test', '@kb-labs/plugin-a', 'alert', 'delivery-001');
    const isDuplicate = await store.checkAndMark('ns-test', '@kb-labs/plugin-b', 'alert', 'delivery-001');
    expect(isDuplicate).toBe(false);
  });

  it('different namespaceIds are isolated (cross-tenant isolation)', async () => {
    await store.checkAndMark('ns-tenant-a', '@kb-labs/plugin', 'alert', 'delivery-001');
    const isDuplicate = await store.checkAndMark('ns-tenant-b', '@kb-labs/plugin', 'alert', 'delivery-001');
    expect(isDuplicate).toBe(false);
  });
});
