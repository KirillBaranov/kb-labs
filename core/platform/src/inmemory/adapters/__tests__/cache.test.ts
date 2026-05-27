import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryCache } from '../cache.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  describe('get / set / delete', () => {
    it('returns null for missing keys', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('stores and retrieves values', async () => {
      await cache.set('k', { v: 1 });
      expect(await cache.get('k')).toEqual({ v: 1 });
    });

    it('overwrites existing values', async () => {
      await cache.set('k', 'a');
      await cache.set('k', 'b');
      expect(await cache.get('k')).toBe('b');
    });

    it('deletes keys', async () => {
      await cache.set('k', 1);
      await cache.delete('k');
      expect(await cache.get('k')).toBeNull();
    });

    it('delete is idempotent for missing keys', async () => {
      await expect(cache.delete('absent')).resolves.toBeUndefined();
    });
  });

  describe('TTL', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires entries after TTL', async () => {
      await cache.set('k', 'v', 1000);
      expect(await cache.get('k')).toBe('v');
      vi.advanceTimersByTime(1001);
      expect(await cache.get('k')).toBeNull();
    });

    it('never expires when TTL is not given', async () => {
      await cache.set('k', 'v');
      vi.advanceTimersByTime(10_000_000);
      expect(await cache.get('k')).toBe('v');
    });
  });

  describe('clear', () => {
    it('without pattern clears everything', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.clear();
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });

    it('with glob pattern clears matching keys only', async () => {
      await cache.set('user:1', 1);
      await cache.set('user:2', 2);
      await cache.set('order:1', 3);
      await cache.clear('user:*');
      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('order:1')).toBe(3);
    });

    it('does not let unescaped dots match other characters', async () => {
      await cache.set('user.session:a', 1);
      await cache.set('user_session:a', 2);
      await cache.clear('user.session:*');
      expect(await cache.get('user.session:a')).toBeNull();
      expect(await cache.get('user_session:a')).toBe(2);
    });
  });

  describe('sorted sets', () => {
    it('zadd + zrangebyscore returns members in score order', async () => {
      await cache.zadd('s', 2, 'b');
      await cache.zadd('s', 1, 'a');
      await cache.zadd('s', 3, 'c');
      expect(await cache.zrangebyscore('s', 0, 10)).toEqual(['a', 'b', 'c']);
    });

    it('zadd replaces score when same member is added', async () => {
      await cache.zadd('s', 1, 'x');
      await cache.zadd('s', 5, 'x');
      expect(await cache.zrangebyscore('s', 0, 10)).toEqual(['x']);
      expect(await cache.zrangebyscore('s', 0, 3)).toEqual([]);
    });

    it('zrangebyscore returns [] for unknown key', async () => {
      expect(await cache.zrangebyscore('missing', 0, 10)).toEqual([]);
    });

    it('zrangebyscore respects min/max bounds inclusively', async () => {
      await cache.zadd('s', 1, 'a');
      await cache.zadd('s', 2, 'b');
      await cache.zadd('s', 3, 'c');
      expect(await cache.zrangebyscore('s', 2, 3)).toEqual(['b', 'c']);
    });

    it('zrem removes a member', async () => {
      await cache.zadd('s', 1, 'a');
      await cache.zadd('s', 2, 'b');
      await cache.zrem('s', 'a');
      expect(await cache.zrangebyscore('s', 0, 10)).toEqual(['b']);
    });

    it('zrem on missing key is a no-op', async () => {
      await expect(cache.zrem('missing', 'a')).resolves.toBeUndefined();
    });

    it('zrem on missing member is a no-op', async () => {
      await cache.zadd('s', 1, 'a');
      await cache.zrem('s', 'b');
      expect(await cache.zrangebyscore('s', 0, 10)).toEqual(['a']);
    });

    it('removes the set entirely when last member is removed', async () => {
      await cache.zadd('s', 1, 'a');
      await cache.zrem('s', 'a');
      expect(await cache.zrangebyscore('s', 0, 10)).toEqual([]);
    });
  });

  describe('setIfNotExists', () => {
    it('writes and returns true when key is absent', async () => {
      expect(await cache.setIfNotExists('k', 'v')).toBe(true);
      expect(await cache.get('k')).toBe('v');
    });

    it('returns false when key already exists', async () => {
      await cache.set('k', 'a');
      expect(await cache.setIfNotExists('k', 'b')).toBe(false);
      expect(await cache.get('k')).toBe('a');
    });

    it('treats expired entries as absent (TTL liveness)', async () => {
      vi.useFakeTimers();
      try {
        await cache.set('k', 'a', 1000);
        vi.advanceTimersByTime(1500);
        expect(await cache.setIfNotExists('k', 'b')).toBe(true);
        expect(await cache.get('k')).toBe('b');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('size', () => {
    it('reflects current entry count', async () => {
      expect(cache.size).toBe(0);
      await cache.set('a', 1);
      await cache.set('b', 2);
      expect(cache.size).toBe(2);
      await cache.delete('a');
      expect(cache.size).toBe(1);
    });
  });
});
