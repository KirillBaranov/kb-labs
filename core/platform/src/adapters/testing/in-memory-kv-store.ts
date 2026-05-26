/**
 * @module @kb-labs/core-platform/adapters/testing/in-memory-kv-store
 *
 * In-memory `IKVStore` for tests. Sufficient for governance / wrapper tests:
 * full method surface, TTL respected on read (lazy expiry), atomic CAS / incr
 * via the single-threaded event loop. No background sweeper.
 */

import type { IKVStore, SetOpts, SignalOpts } from '../database.js';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

export class InMemoryKVStore implements IKVStore {
  private readonly map = new Map<string, Entry>();
  private closed = false;

  private throwIfClosed(): void {
    if (this.closed) { throw new Error('InMemoryKVStore is closed'); }
  }

  private isExpired(entry: Entry, at: number = Date.now()): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= at;
  }

  private getLive(key: string): Entry | null {
    const e = this.map.get(key);
    if (!e) { return null; }
    if (this.isExpired(e)) {
      this.map.delete(key);
      return null;
    }
    return e;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.throwIfClosed();
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('KV key must be a non-empty string');
    }
    const e = this.getLive(key);
    return e ? (e.value as T) : null;
  }

  async getMany<T = unknown>(keys: string[]): Promise<Array<T | null>> {
    this.throwIfClosed();
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }

  async set<T = unknown>(key: string, value: T, options?: SetOpts): Promise<boolean> {
    this.throwIfClosed();
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('KV key must be a non-empty string');
    }
    if (options?.ifNotExists && options?.ifExists) {
      throw new Error('ifNotExists and ifExists are mutually exclusive');
    }
    const present = this.getLive(key) !== null;
    if (options?.ifNotExists && present) { return false; }
    if (options?.ifExists && !present) { return false; }
    const expiresAt = typeof options?.ttlMs === 'number' ? Date.now() + options.ttlMs : null;
    this.map.set(key, { value, expiresAt });
    return true;
  }

  async setMany<T = unknown>(
    entries: Array<{ key: string; value: T; ttlMs?: number }>,
  ): Promise<void> {
    this.throwIfClosed();
    // Atomic — validate then write.
    for (const e of entries) {
      if (typeof e.key !== 'string' || e.key.length === 0) {
        throw new Error('KV key must be a non-empty string');
      }
    }
    const now = Date.now();
    for (const e of entries) {
      this.map.set(e.key, {
        value: e.value,
        expiresAt: typeof e.ttlMs === 'number' ? now + e.ttlMs : null,
      });
    }
  }

  async setIfNotExists<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean> {
    return this.set(key, value, { ttlMs: options?.ttlMs, ifNotExists: true });
  }

  async delete(key: string): Promise<boolean> {
    this.throwIfClosed();
    const existed = this.getLive(key) !== null;
    this.map.delete(key);
    return existed;
  }

  async exists(key: string): Promise<boolean> {
    this.throwIfClosed();
    return this.getLive(key) !== null;
  }

  async cas<T = unknown>(
    key: string,
    expected: T,
    next: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean> {
    this.throwIfClosed();
    const current = this.getLive(key);
    const currentValue = current ? current.value : null;
    if (JSON.stringify(currentValue) !== JSON.stringify(expected)) { return false; }
    const expiresAt = typeof options?.ttlMs === 'number'
      ? Date.now() + options.ttlMs
      : current?.expiresAt ?? null;
    this.map.set(key, { value: next, expiresAt });
    return true;
  }

  async incr(
    key: string,
    delta = 1,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<number> {
    this.throwIfClosed();
    if (!Number.isFinite(delta)) {
      throw new Error('incr delta must be a finite number');
    }
    const current = this.getLive(key);
    if (current && typeof current.value !== 'number') {
      throw new Error(`incr target "${key}" is not a number`);
    }
    const nextValue = (current ? (current.value as number) : 0) + delta;
    const expiresAt = typeof options?.ttlMs === 'number'
      ? Date.now() + options.ttlMs
      : current?.expiresAt ?? null;
    this.map.set(key, { value: nextValue, expiresAt });
    return nextValue;
  }

  async ttl(key: string): Promise<number | null> {
    this.throwIfClosed();
    const e = this.getLive(key);
    if (!e || e.expiresAt === null) { return null; }
    return Math.max(0, e.expiresAt - Date.now());
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    this.throwIfClosed();
    const e = this.getLive(key);
    if (!e) { return false; }
    e.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async persist(key: string): Promise<boolean> {
    this.throwIfClosed();
    const e = this.getLive(key);
    if (!e) { return false; }
    e.expiresAt = null;
    return true;
  }

  scan(
    prefix = '',
    _options?: { batchSize?: number } & SignalOpts,
  ): AsyncIterable<{ key: string; value: unknown }> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        self.throwIfClosed();
        for (const [key, entry] of [...self.map.entries()]) {
          if (self.isExpired(entry)) { self.map.delete(key); continue; }
          if (!key.startsWith(prefix)) { continue; }
          yield { key, value: entry.value };
        }
      },
    };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: !this.closed, latencyMs: 0 };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function createInMemoryKVStore(): InMemoryKVStore {
  return new InMemoryKVStore();
}
