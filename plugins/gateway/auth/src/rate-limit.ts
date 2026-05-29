/**
 * @module @kb-labs/gateway-auth/rate-limit
 *
 * Fixed-window rate limiter on top of `IKVStore` (ADR-0020, Phase 1.8).
 *
 * Used for per-email login limits and activation rate-limiting.
 * Per-IP limits are configured at the gateway layer itself (its
 * existing rate-limit plugin) and are not touched here.
 *
 * Fixed window, not sliding: TTL is applied **once** on the first
 * increment and never extended. Subsequent increments within the
 * window just bump the counter. Once the key expires, the counter
 * starts over.
 *
 * The choice of fixed vs sliding matters: a sliding window would mean
 * "5 attempts in any 60-second window", which an attacker can game by
 * pacing exactly under the limit forever. Fixed window puts a hard
 * ceiling per window and the counter actually resets.
 */

import type { IKVStore } from '@kb-labs/core-platform/adapters';

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

export interface RateLimiter {
  /**
   * Increment the counter and report whether this hit is allowed.
   * Use on the event you want to count (e.g. a FAILED login attempt).
   */
  check(key: string, cfg: RateLimitConfig): Promise<RateLimitResult>;
  /**
   * Read the current counter WITHOUT incrementing and report whether the
   * next `check()` would be allowed.
   *
   * This exists so a caller can reject early — before doing expensive work
   * such as a bcrypt compare — once the window is already exhausted. Without
   * a peek, the only way to know the limit is hit is to `check()` (which
   * increments), forcing the expensive work to run first. peek() lets the
   * login handler gate bcrypt on the existing failure count, closing a
   * CPU-exhaustion DoS where an attacker spams requests past the limit and
   * still pays for a bcrypt round-trip on each.
   */
  peek(key: string, cfg: RateLimitConfig): Promise<RateLimitResult>;
}

const retryAfterFor = async (kv: IKVStore, key: string, cfg: RateLimitConfig): Promise<number> => {
  const remainingTtlMs = await kv.ttl(key);
  return remainingTtlMs !== null
    ? Math.max(1, Math.ceil(remainingTtlMs / 1000))
    : Math.ceil(cfg.windowMs / 1000);
};

export const createRateLimiter = (kv: IKVStore): RateLimiter => ({
  async check(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
    const count = await kv.incr(key, 1);
    if (count === 1) {
      // First hit in this window — set the TTL. Subsequent hits will
      // just bump the counter without touching the TTL.
      await kv.expire(key, cfg.windowMs);
    }
    if (count > cfg.max) {
      return { allowed: false, retryAfterSec: await retryAfterFor(kv, key, cfg) };
    }
    return { allowed: true, remaining: cfg.max - count };
  },

  async peek(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
    const raw = await kv.get<number>(key);
    const count = typeof raw === 'number' ? raw : 0;
    // The window is exhausted once the counter has already reached `max`:
    // the next check() would push it to max+1 and be denied. Reject now,
    // before any expensive work, without touching the counter.
    if (count >= cfg.max) {
      return { allowed: false, retryAfterSec: await retryAfterFor(kv, key, cfg) };
    }
    return { allowed: true, remaining: cfg.max - count };
  },
});
