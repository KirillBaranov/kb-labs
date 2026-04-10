import { describe, it, expect } from 'vitest';
import { mockCache } from '../mock-cache.js';

describe('mockCache', () => {
  describe('basic operations', () => {
    it('should store and retrieve values', async () => {
      const cache = mockCache();
      await cache.set('key', { name: 'Alice' });

      const result = await cache.get<{ name: string }>('key');
      expect(result).toEqual({ name: 'Alice' });
    });

    it('should return null for missing keys', async () => {
      const cache = mockCache();
      expect(await cache.get('missing')).toBeNull();
    });

    it('should delete values', async () => {
      const cache = mockCache();
      await cache.set('key', 'value');
      await cache.delete('key');
      expect(await cache.get('key')).toBeNull();
    });

    it('should clear all values', async () => {
      const cache = mockCache();
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.clear();
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });

    it('should clear by prefix pattern', async () => {
      const cache = mockCache();
      await cache.set('user:1', 'Alice');
      await cache.set('user:2', 'Bob');
      await cache.set('post:1', 'Hello');

      await cache.clear('user:*');

      expect(await cache.get('user:1')).toBeNull();
      expect(await cache.get('user:2')).toBeNull();
      expect(await cache.get('post:1')).toBe('Hello');
    });
  });

  describe('TTL', () => {
    it('should expire entries after TTL', async () => {
      const cache = mockCache();
      await cache.set('key', 'value', 50); // 50ms TTL

      // Still alive
      expect(await cache.get('key')).toBe('value');

      // Wait for expiry
      await new Promise(r => { setTimeout(r, 100); });
      expect(await cache.get('key')).toBeNull();
    });

    it('should not expire entries without TTL', async () => {
      const cache = mockCache();
      await cache.set('key', 'value'); // no TTL

      await new Promise(r => { setTimeout(r, 50); });
      expect(await cache.get('key')).toBe('value');
    });
  });

  describe('setIfNotExists', () => {
    it('should set value if key does not exist', async () => {
      const cache = mockCache();
      const result = await cache.setIfNotExists('key', 'value');
      expect(result).toBe(true);
      expect(await cache.get('key')).toBe('value');
    });

    it('should not overwrite existing value', async () => {
      const cache = mockCache();
      await cache.set('key', 'original');
      const result = await cache.setIfNotExists('key', 'new');
      expect(result).toBe(false);
      expect(await cache.get('key')).toBe('original');
    });
  });

  describe('sorted sets', () => {
    it('should add and retrieve by score range', async () => {
      const cache = mockCache();
      await cache.zadd('myset', 1, 'a');
      await cache.zadd('myset', 3, 'c');
      await cache.zadd('myset', 2, 'b');

      const result = await cache.zrangebyscore('myset', 1, 2);
      expect(result).toEqual(['a', 'b']);
    });

    it('should remove members', async () => {
      const cache = mockCache();
      await cache.zadd('myset', 1, 'a');
      await cache.zadd('myset', 2, 'b');

      await cache.zrem('myset', 'a');

      const result = await cache.zrangebyscore('myset', 0, 10);
      expect(result).toEqual(['b']);
    });

    it('should update score for existing member', async () => {
      const cache = mockCache();
      await cache.zadd('myset', 1, 'a');
      await cache.zadd('myset', 5, 'a'); // update score

      const result = await cache.zrangebyscore('myset', 4, 6);
      expect(result).toEqual(['a']);
    });
  });

  describe('initial data', () => {
    it('should accept pre-populated data', async () => {
      const cache = mockCache({
        'user:1': { name: 'Alice' },
        'config': 'debug',
      });

      expect(await cache.get('user:1')).toEqual({ name: 'Alice' });
      expect(await cache.get('config')).toBe('debug');
    });
  });

  describe('spy tracking', () => {
    it('all methods should be vi.fn() spies', async () => {
      const cache = mockCache();
      await cache.set('key', 'value');
      await cache.get('key');

      expect(cache.set).toHaveBeenCalledWith('key', 'value');
      expect(cache.get).toHaveBeenCalledWith('key');
    });
  });

  describe('internal state access', () => {
    it('should expose .store for assertions', async () => {
      const cache = mockCache();
      await cache.set('key', 'value');

      expect(cache.store.size).toBe(1);
      expect(cache.store.has('key')).toBe(true);
    });

    it('should expose .sortedSets for assertions', async () => {
      const cache = mockCache();
      await cache.zadd('myset', 1, 'a');

      expect(cache.sortedSets.size).toBe(1);
      expect(cache.sortedSets.get('myset')).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('should clear all data and spy history', async () => {
      const cache = mockCache();
      await cache.set('key', 'value');
      await cache.zadd('myset', 1, 'a');

      cache.reset();

      expect(cache.store.size).toBe(0);
      expect(cache.sortedSets.size).toBe(0);
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
