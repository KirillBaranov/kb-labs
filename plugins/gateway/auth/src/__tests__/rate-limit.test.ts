/**
 * Tests for the rate-limit helper (ADR-0020, Phase 1.8).
 *
 * Fixed-window counter built on top of `IKVStore.incr` + `expire`.
 *
 * - First call sets TTL on the key; subsequent increments inside the
 *   window do not extend it (true fixed window, not sliding).
 * - `allowed: false` past max with `retryAfterSec` reflecting remaining
 *   TTL.
 * - Distinct keys are independent.
 *
 * We use short windows (≤100ms) so the tests exercise window reset
 * without needing time mocks.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryKVStore } from '@kb-labs/core-platform/adapters/testing';
import type { IKVStore } from '@kb-labs/core-platform/adapters';
import { createRateLimiter } from '../rate-limit.js';

let kv: IKVStore;

beforeEach(() => {
  kv = createInMemoryKVStore();
});

const sleep = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });

describe('createRateLimiter', () => {
  it('allows up to max, blocks beyond', async () => {
    const rl = createRateLimiter(kv);
    const cfg = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const r = await rl.check('login:email:a@b.c', cfg);
      expect(r.allowed).toBe(true);
      if (r.allowed) {expect(r.remaining).toBe(2 - i);}
    }
    const fourth = await rl.check('login:email:a@b.c', cfg);
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) {
      expect(fourth.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it('does NOT slide — TTL is set on first call only', async () => {
    const rl = createRateLimiter(kv);
    const cfg = { max: 5, windowMs: 80 };
    await rl.check('k', cfg);
    await sleep(40);
    await rl.check('k', cfg);
    // If TTL was reset on every call, this would still be in-window.
    // Because TTL is fixed, the window expires ~80ms after the first call.
    await sleep(60);
    const fresh = await rl.check('k', cfg);
    // Counter should have reset to 1.
    expect(fresh.allowed).toBe(true);
    if (fresh.allowed) {expect(fresh.remaining).toBe(4);}
  });

  it('isolates keys', async () => {
    const rl = createRateLimiter(kv);
    const cfg = { max: 1, windowMs: 60_000 };
    expect((await rl.check('a', cfg)).allowed).toBe(true);
    expect((await rl.check('b', cfg)).allowed).toBe(true);
    expect((await rl.check('a', cfg)).allowed).toBe(false);
    expect((await rl.check('b', cfg)).allowed).toBe(false);
  });

  it('retryAfterSec is at most ceil(windowMs/1000)', async () => {
    const rl = createRateLimiter(kv);
    const cfg = { max: 1, windowMs: 60_000 };
    await rl.check('k', cfg);
    const blocked = await rl.check('k', cfg);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
      expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });
});
