/**
 * Unit tests for WebhookSecretStore.
 *
 * Uses InMemoryCache from core-platform to test round-trips,
 * rotation logic, and multi-instance key isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookSecretStore } from '../webhook/secret-store.js';

describe('WebhookSecretStore', () => {
  let cache: InMemoryCache;
  let store: WebhookSecretStore;

  beforeEach(() => {
    cache = new InMemoryCache();
    store = new WebhookSecretStore(cache);
  });

  describe('get / set round-trip', () => {
    it('returns null for non-existent key', async () => {
      const result = await store.get('ns1', '@kb-labs/plugin', 'alert');
      expect(result).toBeNull();
    });

    it('returns stored entry', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'secret-abc' });
      const result = await store.get('ns1', '@kb-labs/plugin', 'alert');
      expect(result).toEqual({ current: 'secret-abc' });
    });

    it('different namespaces are isolated', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'secret-a' });
      await store.set('ns2', '@kb-labs/plugin', 'alert', { current: 'secret-b' });
      expect((await store.get('ns1', '@kb-labs/plugin', 'alert'))?.current).toBe('secret-a');
      expect((await store.get('ns2', '@kb-labs/plugin', 'alert'))?.current).toBe('secret-b');
    });
  });

  describe('rotate', () => {
    it('sets current on first provision (no prior entry)', async () => {
      const entry = await store.rotate('ns1', '@kb-labs/plugin', 'push', 'new-secret');
      expect(entry.current).toBe('new-secret');
      expect(entry.previous).toBeUndefined();
      expect(entry.previousExpiresAt).toBeUndefined();
    });

    it('moves current to previous with 24h expiry', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'push', { current: 'old-secret' });

      const before = Date.now();
      const entry = await store.rotate('ns1', '@kb-labs/plugin', 'push', 'new-secret');
      const after = Date.now();

      expect(entry.current).toBe('new-secret');
      expect(entry.previous).toBe('old-secret');
      expect(entry.previousExpiresAt).toBeGreaterThanOrEqual(before + 86_400_000);
      expect(entry.previousExpiresAt).toBeLessThanOrEqual(after + 86_400_000);
    });

    it('second rotate replaces current and keeps new previous', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'push', { current: 'v1' });
      await store.rotate('ns1', '@kb-labs/plugin', 'push', 'v2');
      const entry = await store.rotate('ns1', '@kb-labs/plugin', 'push', 'v3');

      expect(entry.current).toBe('v3');
      expect(entry.previous).toBe('v2');
    });

    it('persists updated entry to cache', async () => {
      await store.rotate('ns1', '@kb-labs/plugin', 'push', 'persisted');
      const fetched = await store.get('ns1', '@kb-labs/plugin', 'push');
      expect(fetched?.current).toBe('persisted');
    });
  });

  describe('delete', () => {
    it('removes the entry', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'to-delete' });
      await store.delete('ns1', '@kb-labs/plugin', 'alert');
      expect(await store.get('ns1', '@kb-labs/plugin', 'alert')).toBeNull();
    });

    it('delete is idempotent (no error if not found)', async () => {
      await expect(
        store.delete('ns1', '@kb-labs/plugin', 'missing')
      ).resolves.not.toThrow();
    });
  });

  describe('multi-instance key isolation', () => {
    it('instance key is separate from no-instance key', async () => {
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'global' });
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'bot-1' }, 'instance-1');
      await store.set('ns1', '@kb-labs/plugin', 'alert', { current: 'bot-2' }, 'instance-2');

      expect((await store.get('ns1', '@kb-labs/plugin', 'alert'))?.current).toBe('global');
      expect((await store.get('ns1', '@kb-labs/plugin', 'alert', 'instance-1'))?.current).toBe('bot-1');
      expect((await store.get('ns1', '@kb-labs/plugin', 'alert', 'instance-2'))?.current).toBe('bot-2');
    });

    it('deleting one instance does not affect others', async () => {
      await store.set('ns1', 'p', 'e', { current: 'a' }, 'inst-a');
      await store.set('ns1', 'p', 'e', { current: 'b' }, 'inst-b');
      await store.delete('ns1', 'p', 'e', 'inst-a');

      expect(await store.get('ns1', 'p', 'e', 'inst-a')).toBeNull();
      expect((await store.get('ns1', 'p', 'e', 'inst-b'))?.current).toBe('b');
    });
  });
});
