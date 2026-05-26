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
  check(key: string, cfg: RateLimitConfig): Promise<RateLimitResult>;
}

export const createRateLimiter = (kv: IKVStore): RateLimiter => ({
  async check(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
    const count = await kv.incr(key, 1);
    if (count === 1) {
      // First hit in this window — set the TTL. Subsequent hits will
      // just bump the counter without touching the TTL.
      await kv.expire(key, cfg.windowMs);
    }
    if (count > cfg.max) {
      const remainingTtlMs = await kv.ttl(key);
      const retryAfterSec = remainingTtlMs !== null
        ? Math.max(1, Math.ceil(remainingTtlMs / 1000))
        : Math.ceil(cfg.windowMs / 1000);
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true, remaining: cfg.max - count };
  },
});
