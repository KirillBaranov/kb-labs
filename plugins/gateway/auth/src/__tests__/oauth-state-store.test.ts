/**
 * Tests for the OAuth state store (ADR-0020, DD-5).
 *
 * A thin, namespaced wrapper over `IKVStore` that holds the per-attempt
 * OAuth `state` → { providerId, tenantId, returnTo, session } binding
 * between `GET /auth/oauth/:id/start` and the IdP callback.
 *
 * Invariants:
 * - `put` persists under a namespaced key with a TTL so abandoned flows
 *   self-clean.
 * - `consume` is **one-shot**: the first caller gets the record, every
 *   subsequent / concurrent caller gets `null`. This is what stops a
 *   replayed callback from logging the victim in twice.
 * - Expired state reads as absent (TTL honoured by the KV).
 * - Distinct state tokens are independent.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryKVStore } from '@kb-labs/sdk/testing';
import type { IKVStore } from '@kb-labs/core-platform/adapters';
import { OAuthStateStore } from '../oauth-state-store.js';

let kv: IKVStore;
const sleep = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });

beforeEach(() => {
  kv = createInMemoryKVStore();
});

const record = (over: Partial<Record<string, unknown>> = {}) => ({
  providerId: 'corp',
  tenantId: 'tenant-a',
  returnTo: '/dashboard',
  session: { nonce: 'n-123' },
  createdAt: Date.now(),
  ...over,
});

describe('put / consume', () => {
  it('round-trips a state record', async () => {
    const store = new OAuthStateStore(kv);
    await store.put('state-1', record());
    const got = await store.consume('state-1');
    expect(got).not.toBeNull();
    expect(got!.providerId).toBe('corp');
    expect(got!.tenantId).toBe('tenant-a');
    expect(got!.returnTo).toBe('/dashboard');
    expect(got!.session).toEqual({ nonce: 'n-123' });
  });

  it('is one-shot — a second consume returns null', async () => {
    const store = new OAuthStateStore(kv);
    await store.put('state-1', record());
    expect(await store.consume('state-1')).not.toBeNull();
    expect(await store.consume('state-1')).toBeNull();
  });

  it('returns null for an unknown state', async () => {
    const store = new OAuthStateStore(kv);
    expect(await store.consume('never-put')).toBeNull();
  });

  it('isolates distinct state tokens', async () => {
    const store = new OAuthStateStore(kv);
    await store.put('a', record({ providerId: 'pa' }));
    await store.put('b', record({ providerId: 'pb' }));
    expect((await store.consume('a'))!.providerId).toBe('pa');
    expect((await store.consume('b'))!.providerId).toBe('pb');
  });

  it('expires state after ttlMs (TTL honoured by KV)', async () => {
    const store = new OAuthStateStore(kv, { ttlMs: 20 });
    await store.put('state-1', record());
    await sleep(40);
    expect(await store.consume('state-1')).toBeNull();
  });

  it('exactly one of N concurrent consumes wins (one-shot under race)', async () => {
    const store = new OAuthStateStore(kv);
    await store.put('state-1', record());
    const results = await Promise.all(
      Array.from({ length: 8 }, () => store.consume('state-1')),
    );
    expect(results.filter(r => r !== null)).toHaveLength(1);
  });
});
