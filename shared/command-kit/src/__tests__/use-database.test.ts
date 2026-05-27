/**
 * @module @kb-labs/shared-command-kit/__tests__/use-database
 *
 * Tests for the document-database and KV-store hooks.
 *
 * Two distinct paths exercised:
 *  1. Default platform (no ALS context) — hooks fall back to the global
 *     singleton, which ships a NoOp adapter. The hook returns a value
 *     (so isXxxAvailable is true) but real ops throw.
 *  2. ALS-wrapped platform context (set via `platformContext.run`) — hooks
 *     return the per-execution platform, including the governed adapter
 *     installed by plugin-runtime's `wrapDocumentDatabase` /
 *     `wrapKVStore`. We simulate that with a fake platform object so we
 *     don't drag in the whole plugin-runtime here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetPlatform } from '@kb-labs/core-runtime';
import { platformContext } from '@kb-labs/plugin-contracts';
import {
  usePlatform,
  useDocumentDatabase,
  isDocumentDatabaseAvailable,
  useKVStore,
  isKVStoreAvailable,
} from '../index.js';

describe('database hooks (default platform / no ALS)', () => {
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
    vi.restoreAllMocks();
  });

  describe('useDocumentDatabase()', () => {
    it('returns the same adapter as usePlatform().documentDatabase', () => {
      const docs = useDocumentDatabase();
      const platformDocs = usePlatform().documentDatabase;
      expect(docs).toBeDefined();
      expect(docs?.constructor).toBe(platformDocs?.constructor);
    });

    it('exposes the full IDocumentDatabase method set', () => {
      const docs = useDocumentDatabase();
      expect(typeof docs?.find).toBe('function');
      expect(typeof docs?.findStream).toBe('function');
      expect(typeof docs?.findById).toBe('function');
      expect(typeof docs?.count).toBe('function');
      expect(typeof docs?.insertOne).toBe('function');
      expect(typeof docs?.insertMany).toBe('function');
      expect(typeof docs?.updateOne).toBe('function');
      expect(typeof docs?.updateMany).toBe('function');
      expect(typeof docs?.updateById).toBe('function');
      expect(typeof docs?.deleteMany).toBe('function');
      expect(typeof docs?.deleteById).toBe('function');
      expect(typeof docs?.bulkWrite).toBe('function');
      expect(typeof docs?.transaction).toBe('function');
      expect(typeof docs?.ensureCollection).toBe('function');
      expect(typeof docs?.ping).toBe('function');
      expect(typeof docs?.close).toBe('function');
    });

    it('InMemory default: writes succeed (documentDatabase falls back to InMemoryDocumentDatabase)', async () => {
      const docs = useDocumentDatabase();
      // documentDatabase defaultFallback is 'inmemory' — writes work out of the box.
      const result = await docs!.insertOne('test-col', { name: 'hello' });
      expect(result.id).toBeDefined();
    });

    it('ping() always succeeds even on the NoOp default', async () => {
      const docs = useDocumentDatabase();
      const result = await docs!.ping();
      expect(result.ok).toBe(true);
    });
  });

  describe('isDocumentDatabaseAvailable()', () => {
    it('returns true when the adapter slot is wired (even NoOp)', () => {
      expect(isDocumentDatabaseAvailable()).toBe(true);
    });
  });

  describe('useKVStore()', () => {
    it('returns the same adapter as usePlatform().kvStore', () => {
      const kv = useKVStore();
      const platformKv = usePlatform().kvStore;
      expect(kv).toBeDefined();
      expect(kv?.constructor).toBe(platformKv?.constructor);
    });

    it('exposes the full IKVStore method set', () => {
      const kv = useKVStore();
      expect(typeof kv?.get).toBe('function');
      expect(typeof kv?.getMany).toBe('function');
      expect(typeof kv?.set).toBe('function');
      expect(typeof kv?.setMany).toBe('function');
      expect(typeof kv?.setIfNotExists).toBe('function');
      expect(typeof kv?.delete).toBe('function');
      expect(typeof kv?.exists).toBe('function');
      expect(typeof kv?.cas).toBe('function');
      expect(typeof kv?.incr).toBe('function');
      expect(typeof kv?.ttl).toBe('function');
      expect(typeof kv?.expire).toBe('function');
      expect(typeof kv?.persist).toBe('function');
      expect(typeof kv?.scan).toBe('function');
      expect(typeof kv?.ping).toBe('function');
      expect(typeof kv?.close).toBe('function');
    });

    it('InMemory default: reads return null (kvStore falls back to InMemoryKVStore)', async () => {
      const kv = useKVStore();
      // kvStore defaultFallback is 'inmemory' — reads return null for missing keys.
      const result = await kv!.get('nonexistent-key');
      expect(result).toBeNull();
    });
  });

  describe('isKVStoreAvailable()', () => {
    it('returns true when the adapter slot is wired (even NoOp)', () => {
      expect(isKVStoreAvailable()).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ALS-scoped platform — verifies the hooks read from AsyncLocalStorage when
// the runtime has set a per-handler platform context.
// ────────────────────────────────────────────────────────────────────────────

describe('database hooks (ALS-scoped platform)', () => {
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
    vi.restoreAllMocks();
  });

  it('useDocumentDatabase returns the ALS-scoped adapter, not the global one', async () => {
    const scopedDocs = {
      find: vi.fn(async () => ['scoped-result']),
      findStream: vi.fn(async function* () { /* empty */ }),
      findById: vi.fn(),
      count: vi.fn(),
      insertOne: vi.fn(),
      insertMany: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      updateById: vi.fn(),
      deleteMany: vi.fn(),
      deleteById: vi.fn(),
      bulkWrite: vi.fn(),
      transaction: vi.fn(),
      ensureCollection: vi.fn(),
      ping: vi.fn(async () => ({ ok: true, latencyMs: 0 })),
      close: vi.fn(async () => {}),
    };

    // Sanity check: outside the ALS scope the hook returns the global noop.
    const globalDocs = useDocumentDatabase();
    expect(globalDocs).not.toBe(scopedDocs);

    await platformContext.run(
      {
        // Minimal subset that the hooks actually touch.
        documentDatabase: scopedDocs,
      } as never,
      async () => {
        const docs = useDocumentDatabase();
        expect(docs).toBe(scopedDocs);
        // And the returned adapter actually forwards calls.
        const result = await docs!.find('runs', {});
        expect(result).toEqual(['scoped-result']);
        expect(scopedDocs.find).toHaveBeenCalledOnce();
      },
    );

    // After the run-block, hooks fall back to the global noop — NOT the
    // scoped fake. (Direct strict-equality against `globalDocs` is unstable
    // because the container builds a fresh NoOp instance on every access
    // when no adapter is registered.)
    expect(useDocumentDatabase()).not.toBe(scopedDocs);
  });

  it('useKVStore returns the ALS-scoped adapter, not the global one', async () => {
    const scopedKv = {
      get: vi.fn(async () => 'scoped-value'),
      getMany: vi.fn(),
      set: vi.fn(),
      setMany: vi.fn(),
      setIfNotExists: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      cas: vi.fn(),
      incr: vi.fn(),
      ttl: vi.fn(),
      expire: vi.fn(),
      persist: vi.fn(),
      scan: vi.fn(async function* () { /* empty */ }),
      ping: vi.fn(async () => ({ ok: true, latencyMs: 0 })),
      close: vi.fn(async () => {}),
    };

    const globalKv = useKVStore();
    expect(globalKv).not.toBe(scopedKv);

    await platformContext.run(
      { kvStore: scopedKv } as never,
      async () => {
        const kv = useKVStore();
        expect(kv).toBe(scopedKv);
        const result = await kv!.get('session:42');
        expect(result).toBe('scoped-value');
        expect(scopedKv.get).toHaveBeenCalledWith('session:42');
      },
    );

    expect(useKVStore()).not.toBe(scopedKv);
  });

  it('nested ALS scopes resolve to the innermost adapter', async () => {
    const outer = { __id: 'outer' } as never;
    const inner = { __id: 'inner' } as never;

    await platformContext.run({ documentDatabase: outer } as never, async () => {
      expect(useDocumentDatabase()).toBe(outer);
      await platformContext.run({ documentDatabase: inner } as never, async () => {
        expect(useDocumentDatabase()).toBe(inner);
      });
      expect(useDocumentDatabase()).toBe(outer);
    });
  });

  it('parallel scopes do not leak across awaits', async () => {
    const adapterA = { __id: 'a' } as never;
    const adapterB = { __id: 'b' } as never;

    await Promise.all([
      platformContext.run({ documentDatabase: adapterA } as never, async () => {
        await new Promise((r) => { setTimeout(r, 5); });
        expect(useDocumentDatabase()).toBe(adapterA);
      }),
      platformContext.run({ documentDatabase: adapterB } as never, async () => {
        await new Promise((r) => { setTimeout(r, 5); });
        expect(useDocumentDatabase()).toBe(adapterB);
      }),
    ]);
  });
});
