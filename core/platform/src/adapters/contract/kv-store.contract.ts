/**
 * @module @kb-labs/core-platform/adapters/__tests__/contract/kv-store
 *
 * Behavioural contract suite for `IKVStore`.
 *
 * Same idea as the document-database suite: every adapter that ships an
 * `IKVStore` implementation runs this against a fresh instance. If two
 * drivers disagree on a test, the contract has leaked and must shrink.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { IKVStore } from '../database.js';

export interface KVContractFactory {
  /** Human-readable name shown in the `describe` block. */
  name: string;
  /** Fresh, empty store. Called once per suite. */
  createInstance: () => Promise<IKVStore>;
  /** Optional driver-level skips for deployment limitations. */
  skip?: {
    ttl?: boolean;
    largeValues?: boolean;
  };
}

export function runKVStoreContract(factory: KVContractFactory): void {
  describe(`IKVStore contract — ${factory.name}`, () => {
    let kv: IKVStore;

    beforeAll(async () => {
      kv = await factory.createInstance();
    });

    afterAll(async () => {
      await kv.close({ drainTimeoutMs: 1000 });
    });

    beforeEach(async () => {
      // Sweep the whole keyspace via scan. This is the only portable way to
      // reset state — `delete` per key would race with the scan cursor.
      const keys: string[] = [];
      for await (const entry of kv.scan('')) {
        keys.push(entry.key);
      }
      for (const key of keys) {
        await kv.delete(key);
      }
    });

    // ────────────────────────────────────────────────────────────────────────
    // Liveness
    // ────────────────────────────────────────────────────────────────────────

    describe('ping', () => {
      it('reports ok', async () => {
        const r = await kv.ping();
        expect(r.ok).toBe(true);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Basic round-trip
    // ────────────────────────────────────────────────────────────────────────

    describe('set / get / delete / exists', () => {
      it('round-trips a string value', async () => {
        const ok = await kv.set('a', 'hello');
        expect(ok).toBe(true);
        expect(await kv.get('a')).toBe('hello');
        expect(await kv.exists('a')).toBe(true);

        const removed = await kv.delete('a');
        expect(removed).toBe(true);
        expect(await kv.get('a')).toBeNull();
        expect(await kv.exists('a')).toBe(false);
      });

      it('round-trips a structured object', async () => {
        const value = { foo: 'bar', nested: { n: 1, arr: [1, 2, 3] } };
        await kv.set('obj', value);
        expect(await kv.get('obj')).toEqual(value);
      });

      it('round-trips numbers and booleans without losing type', async () => {
        await kv.set('n', 42);
        await kv.set('b', true);
        expect(await kv.get<number>('n')).toBe(42);
        expect(await kv.get<boolean>('b')).toBe(true);
      });

      it('delete returns false when the key is absent', async () => {
        expect(await kv.delete('never-existed')).toBe(false);
      });

      it('get returns null for absent keys', async () => {
        expect(await kv.get('missing')).toBeNull();
      });
    });

    describe('set flags', () => {
      it('ifNotExists succeeds only the first time', async () => {
        expect(await kv.set('once', 'first', { ifNotExists: true })).toBe(true);
        expect(await kv.set('once', 'second', { ifNotExists: true })).toBe(false);
        expect(await kv.get('once')).toBe('first');
      });

      it('ifExists succeeds only when the key is present', async () => {
        expect(await kv.set('only-existing', 'v', { ifExists: true })).toBe(false);
        await kv.set('only-existing', 'initial');
        expect(await kv.set('only-existing', 'replaced', { ifExists: true })).toBe(true);
        expect(await kv.get('only-existing')).toBe('replaced');
      });

      it('throws when both ifNotExists and ifExists are set', async () => {
        await expect(
          kv.set('bad', 'v', { ifNotExists: true, ifExists: true }),
        ).rejects.toThrow();
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // setIfNotExists race-safety
    // ────────────────────────────────────────────────────────────────────────

    describe('setIfNotExists', () => {
      it('exactly one of N parallel calls wins', async () => {
        const N = 10;
        const results = await Promise.all(
          Array.from({ length: N }, (_, i) => kv.setIfNotExists('race', `winner-${i}`)),
        );
        const wins = results.filter((r: boolean) => r === true);
        expect(wins).toHaveLength(1);
        const stored = await kv.get('race');
        expect(stored).toMatch(/^winner-\d+$/);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // CAS
    // ────────────────────────────────────────────────────────────────────────

    describe('cas', () => {
      it('replaces value when expected matches', async () => {
        await kv.set('cas-key', { v: 1 });
        const ok = await kv.cas('cas-key', { v: 1 }, { v: 2 });
        expect(ok).toBe(true);
        expect(await kv.get('cas-key')).toEqual({ v: 2 });
      });

      it('refuses to replace when expected mismatches', async () => {
        await kv.set('cas-key', { v: 1 });
        const ok = await kv.cas('cas-key', { v: 99 }, { v: 2 });
        expect(ok).toBe(false);
        expect(await kv.get('cas-key')).toEqual({ v: 1 });
      });

      it('returns false on missing key (does not implicitly create)', async () => {
        const ok = await kv.cas('absent', null as never, { v: 1 });
        expect(ok).toBe(false);
        expect(await kv.get('absent')).toBeNull();
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // incr
    // ────────────────────────────────────────────────────────────────────────

    describe('incr', () => {
      it('initialises absent keys to delta', async () => {
        expect(await kv.incr('counter', 3)).toBe(3);
      });

      it('default delta is 1', async () => {
        await kv.set('c', 5);
        expect(await kv.incr('c')).toBe(6);
      });

      it('supports negative deltas', async () => {
        await kv.set('c', 10);
        expect(await kv.incr('c', -3)).toBe(7);
      });

      it('100 parallel incrs converge to 100', async () => {
        await Promise.all(Array.from({ length: 100 }, () => kv.incr('par-counter')));
        expect(await kv.get<number>('par-counter')).toBe(100);
      });

      it('throws when the existing value is not a number', async () => {
        await kv.set('str', 'not-a-number');
        await expect(kv.incr('str')).rejects.toThrow();
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Bulk
    // ────────────────────────────────────────────────────────────────────────

    describe('getMany / setMany', () => {
      it('setMany writes atomically and preserves order in getMany', async () => {
        await kv.setMany<unknown>([
          { key: 'a', value: 1 },
          { key: 'b', value: 'two' },
          { key: 'c', value: { x: 3 } },
        ]);
        const got = await kv.getMany<unknown>(['a', 'b', 'c', 'missing']);
        expect(got).toEqual([1, 'two', { x: 3 }, null]);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // TTL
    // ────────────────────────────────────────────────────────────────────────

    describe('TTL', () => {
      const skipIf = factory.skip?.ttl ? it.skip : it;

      skipIf('keys become invisible after TTL', async () => {
        await kv.set('temp', 'v', { ttlMs: 50 });
        expect(await kv.get('temp')).toBe('v');
        await new Promise((r) => { setTimeout(r, 120); });
        expect(await kv.get('temp')).toBeNull();
        expect(await kv.exists('temp')).toBe(false);
      });

      skipIf('ttl() reports remaining or null', async () => {
        await kv.set('with-ttl', 'v', { ttlMs: 60_000 });
        const remaining = await kv.ttl('with-ttl');
        expect(remaining).not.toBeNull();
        expect(remaining!).toBeGreaterThan(0);
        expect(remaining!).toBeLessThanOrEqual(60_000);

        await kv.set('no-ttl', 'v');
        expect(await kv.ttl('no-ttl')).toBeNull();

        expect(await kv.ttl('absent')).toBeNull();
      });

      skipIf('expire extends TTL on existing keys', async () => {
        await kv.set('e', 'v');
        const ok = await kv.expire('e', 60_000);
        expect(ok).toBe(true);
        const remaining = await kv.ttl('e');
        expect(remaining).toBeGreaterThan(0);
      });

      skipIf('expire returns false on absent keys', async () => {
        expect(await kv.expire('absent', 1000)).toBe(false);
      });

      skipIf('persist removes TTL', async () => {
        await kv.set('p', 'v', { ttlMs: 60_000 });
        expect(await kv.persist('p')).toBe(true);
        expect(await kv.ttl('p')).toBeNull();
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // scan
    // ────────────────────────────────────────────────────────────────────────

    describe('scan', () => {
      it('yields all keys with the given prefix', async () => {
        await kv.set('user:1', 'a');
        await kv.set('user:2', 'b');
        await kv.set('session:1', 'c');

        const collected: Array<{ key: string; value: unknown }> = [];
        for await (const entry of kv.scan('user:')) {
          collected.push(entry);
        }
        expect(collected.map((e) => e.key).sort()).toEqual(['user:1', 'user:2']);
      });

      it('empty prefix yields the whole namespace', async () => {
        await kv.set('a', 1);
        await kv.set('b', 2);
        const keys: string[] = [];
        for await (const entry of kv.scan('')) {
          keys.push(entry.key);
        }
        expect(keys.sort()).toEqual(['a', 'b']);
      });

      it('respects AbortSignal', async () => {
        for (let i = 0; i < 20; i++) {
          await kv.set(`k:${i}`, i);
        }
        const controller = new AbortController();
        const collected: string[] = [];
        try {
          for await (const entry of kv.scan('k:', { batchSize: 2, signal: controller.signal })) {
            collected.push(entry.key);
            if (collected.length === 3) {
              controller.abort();
            }
          }
        } catch {
          /* abort surface */
        }
        expect(collected.length).toBeLessThan(20);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Large values
    // ────────────────────────────────────────────────────────────────────────

    describe('large values', () => {
      const skipIf = factory.skip?.largeValues ? it.skip : it;

      skipIf('round-trips a >1MB JSON payload', async () => {
        const blob = { data: 'x'.repeat(1_100_000) };
        await kv.set('big', blob);
        const out = await kv.get<{ data: string }>('big');
        expect(out?.data.length).toBe(blob.data.length);
      });
    });
  });
}
