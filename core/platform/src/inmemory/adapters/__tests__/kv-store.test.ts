import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryKVStore, createInMemoryKVStore } from '../kv-store.js';

describe('InMemoryKVStore', () => {
  let kv: InMemoryKVStore;

  beforeEach(() => {
    kv = new InMemoryKVStore();
  });

  describe('basic CRUD', () => {
    it('get returns null for missing keys', async () => {
      expect(await kv.get('missing')).toBeNull();
    });

    it('set + get round-trip', async () => {
      await kv.set('k', { v: 1 });
      expect(await kv.get('k')).toEqual({ v: 1 });
    });

    it('rejects empty / non-string keys', async () => {
      await expect(kv.get('')).rejects.toThrow(/non-empty string/);
      await expect(kv.set('', 1)).rejects.toThrow(/non-empty string/);
    });

    it('getMany returns parallel array (with nulls for missing)', async () => {
      await kv.set('a', 1);
      expect(await kv.getMany(['a', 'b'])).toEqual([1, null]);
    });

    it('delete returns whether the key existed', async () => {
      await kv.set('k', 1);
      expect(await kv.delete('k')).toBe(true);
      expect(await kv.delete('k')).toBe(false);
    });

    it('exists reflects presence', async () => {
      await kv.set('k', 1);
      expect(await kv.exists('k')).toBe(true);
      await kv.delete('k');
      expect(await kv.exists('k')).toBe(false);
    });
  });

  describe('conditional set', () => {
    it('ifNotExists writes only when absent', async () => {
      expect(await kv.set('k', 'a', { ifNotExists: true })).toBe(true);
      expect(await kv.set('k', 'b', { ifNotExists: true })).toBe(false);
      expect(await kv.get('k')).toBe('a');
    });

    it('ifExists writes only when present', async () => {
      expect(await kv.set('k', 'a', { ifExists: true })).toBe(false);
      await kv.set('k', 'x');
      expect(await kv.set('k', 'b', { ifExists: true })).toBe(true);
      expect(await kv.get('k')).toBe('b');
    });

    it('rejects ifNotExists + ifExists combo', async () => {
      await expect(
        kv.set('k', 1, { ifNotExists: true, ifExists: true }),
      ).rejects.toThrow(/mutually exclusive/);
    });

    it('setIfNotExists is a thin wrapper', async () => {
      expect(await kv.setIfNotExists('k', 1)).toBe(true);
      expect(await kv.setIfNotExists('k', 2)).toBe(false);
    });
  });

  describe('TTL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('expires on read (lazy)', async () => {
      await kv.set('k', 'v', { ttlMs: 1000 });
      vi.advanceTimersByTime(1500);
      expect(await kv.get('k')).toBeNull();
      expect(await kv.exists('k')).toBe(false);
    });

    it('ttl returns remaining millis or null', async () => {
      expect(await kv.ttl('missing')).toBeNull();
      await kv.set('p', 1);
      expect(await kv.ttl('p')).toBeNull();
      await kv.set('t', 1, { ttlMs: 5000 });
      const remaining = await kv.ttl('t');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    it('expire sets a new TTL on an existing key', async () => {
      await kv.set('k', 1);
      expect(await kv.expire('k', 1000)).toBe(true);
      expect(await kv.expire('missing', 1000)).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(await kv.get('k')).toBeNull();
    });

    it('persist removes a TTL', async () => {
      await kv.set('k', 1, { ttlMs: 1000 });
      expect(await kv.persist('k')).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(await kv.get('k')).toBe(1);
    });

    it('persist returns false for missing keys', async () => {
      expect(await kv.persist('missing')).toBe(false);
    });
  });

  describe('cas', () => {
    it('replaces only when current matches expected', async () => {
      await kv.set('k', 1);
      expect(await kv.cas('k', 1, 2)).toBe(true);
      expect(await kv.get('k')).toBe(2);
      expect(await kv.cas('k', 1, 3)).toBe(false);
      expect(await kv.get('k')).toBe(2);
    });

    it('cas works for null when key is absent', async () => {
      expect(await kv.cas('k', null, 'new')).toBe(true);
      expect(await kv.get('k')).toBe('new');
    });

    it('cas can refresh TTL', async () => {
      vi.useFakeTimers();
      try {
        await kv.set('k', 1, { ttlMs: 1000 });
        await kv.cas('k', 1, 2, { ttlMs: 5000 });
        vi.advanceTimersByTime(2000);
        expect(await kv.get('k')).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('incr', () => {
    it('initialises missing keys at 0', async () => {
      expect(await kv.incr('counter')).toBe(1);
      expect(await kv.incr('counter', 4)).toBe(5);
    });

    it('rejects non-finite deltas', async () => {
      await expect(kv.incr('k', NaN)).rejects.toThrow(/finite number/);
      await expect(kv.incr('k', Infinity)).rejects.toThrow(/finite number/);
    });

    it('rejects when target is not a number', async () => {
      await kv.set('k', 'text');
      await expect(kv.incr('k')).rejects.toThrow(/not a number/);
    });
  });

  describe('setMany', () => {
    it('writes all entries atomically', async () => {
      await kv.setMany([
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ]);
      expect(await kv.get('a')).toBe(1);
      expect(await kv.get('b')).toBe(2);
    });

    it('rejects any invalid key without writing', async () => {
      await expect(
        kv.setMany([
          { key: 'ok', value: 1 },
          { key: '', value: 2 },
        ]),
      ).rejects.toThrow(/non-empty string/);
      expect(await kv.get('ok')).toBeNull();
    });
  });

  describe('scan', () => {
    it('iterates entries with a prefix filter', async () => {
      await kv.set('user:1', 1);
      await kv.set('user:2', 2);
      await kv.set('order:1', 3);
      const collected: string[] = [];
      for await (const { key } of kv.scan('user:')) {
        collected.push(key);
      }
      expect(collected.sort()).toEqual(['user:1', 'user:2']);
    });

    it('skips expired entries during iteration', async () => {
      vi.useFakeTimers();
      try {
        await kv.set('a', 1, { ttlMs: 100 });
        await kv.set('b', 2);
        vi.advanceTimersByTime(500);
        const seen: string[] = [];
        for await (const { key } of kv.scan('')) { seen.push(key); }
        expect(seen).toEqual(['b']);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('lifecycle', () => {
    it('ping reports ok while open', async () => {
      expect((await kv.ping()).ok).toBe(true);
    });

    it('close marks the store closed and subsequent ops throw', async () => {
      await kv.close();
      expect((await kv.ping()).ok).toBe(false);
      await expect(kv.get('k')).rejects.toThrow(/closed/);
    });
  });

  it('factory returns a fresh instance each call', () => {
    const a = createInMemoryKVStore();
    const b = createInMemoryKVStore();
    expect(a).toBeInstanceOf(InMemoryKVStore);
    expect(a).not.toBe(b);
  });
});
