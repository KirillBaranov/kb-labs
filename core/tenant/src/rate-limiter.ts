/**
 * @module @kb-labs/tenant/rate-limiter
 * Tenant rate limiter backed by platform.cache (ICache).
 *
 * Uses the same cache adapter as all other platform components —
 * no extra dependencies, swappable backend (memory / Redis / etc.).
 */

import type { ICache } from '@kb-labs/core-platform';
import type { TenantQuotas, TenantTier } from './types.js';
import { DEFAULT_QUOTAS } from './types.js';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Timestamp when the limit resets (Unix ms) */
  resetAt: number;
  /** Limit for current window */
  limit: number;
}

/**
 * Token consumption result
 */
export interface TokenLimitResult {
  /** Whether token budget allows the request */
  allowed: boolean;
  /** Tokens consumed so far today */
  consumed: number;
  /** Daily token limit (-1 = unlimited) */
  limit: number;
  /** Timestamp when the daily window resets (start of next UTC day, Unix ms) */
  resetAt: number;
}

/**
 * Rate limit resource types
 */
export type RateLimitResource = 'requests' | 'workflows' | 'plugins';

/**
 * Tenant rate limiter backed by platform.cache.
 *
 * All counters use cache TTL for cleanup — no background timers needed.
 */
export class TenantRateLimiter {
  constructor(
    private cache: ICache,
    private quotas: Map<string, TenantQuotas> = new Map()
  ) {}

  /**
   * Check (and increment) the per-minute rate limit for a tenant.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource type to rate limit
   * @returns Rate limit check result
   */
  async checkLimit(
    tenantId: string,
    resource: RateLimitResource
  ): Promise<RateLimitResult> {
    const quota = this.quotas.get(tenantId) ?? DEFAULT_QUOTAS.free;
    const limit = this.getLimit(quota, resource);
    const window = this.getMinuteWindow();
    // key: ratelimit:tenant:<id>:<resource>:<YYYY-MM-DDTHH:MM>
    const key = `ratelimit:tenant:${tenantId}:${resource}:${window}`;
    const ttl = 60_000; // 1 minute

    const current = (await this.cache.get<number>(key)) ?? 0;

    if (current >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: this.getMinuteResetTime(),
        limit,
      };
    }

    await this.cache.set(key, current + 1, ttl);

    return {
      allowed: true,
      remaining: limit - current - 1,
      resetAt: this.getMinuteResetTime(),
      limit,
    };
  }

  /**
   * Record consumed tokens and check whether the daily token budget is exceeded.
   *
   * Call this after a successful LLM response when the token count is known.
   * Returns allowed=false when the budget was already exceeded BEFORE this call
   * (i.e. the previous total was already >= limit). The current call's tokens
   * are still recorded so the counter stays accurate.
   *
   * @param tenantId  - Tenant identifier
   * @param tokens    - Number of tokens consumed in this request (prompt + completion)
   */
  async trackTokens(tenantId: string, tokens: number): Promise<TokenLimitResult> {
    const quota = this.quotas.get(tenantId) ?? DEFAULT_QUOTAS.free;
    const limit = quota.tokensPerDay;
    const day = this.getDayWindow();
    // key: ratelimit:tenant:<id>:tokens:<YYYY-MM-DD>
    const key = `ratelimit:tenant:${tenantId}:tokens:${day}`;
    const ttl = 25 * 60 * 60 * 1000; // 25 h — outlasts the day window with margin

    const consumed = (await this.cache.get<number>(key)) ?? 0;
    const newTotal = consumed + tokens;
    await this.cache.set(key, newTotal, ttl);

    if (limit === -1) {
      return { allowed: true, consumed: newTotal, limit, resetAt: this.getDayResetTime() };
    }

    return {
      allowed: consumed < limit, // allowed if budget wasn't exhausted before this call
      consumed: newTotal,
      limit,
      resetAt: this.getDayResetTime(),
    };
  }

  /**
   * Read current token consumption without incrementing.
   */
  async getTokenUsage(tenantId: string): Promise<TokenLimitResult> {
    const quota = this.quotas.get(tenantId) ?? DEFAULT_QUOTAS.free;
    const limit = quota.tokensPerDay;
    const day = this.getDayWindow();
    const key = `ratelimit:tenant:${tenantId}:tokens:${day}`;
    const consumed = (await this.cache.get<number>(key)) ?? 0;

    return {
      allowed: limit === -1 || consumed < limit,
      consumed,
      limit,
      resetAt: this.getDayResetTime(),
    };
  }

  /** Set quotas for a specific tenant (overrides tier default). */
  setQuotas(tenantId: string, quotas: TenantQuotas): void {
    this.quotas.set(tenantId, quotas);
  }

  /** Set quotas for a tenant by tier. */
  setTier(tenantId: string, tier: TenantTier): void {
    this.quotas.set(tenantId, { ...DEFAULT_QUOTAS[tier] });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /** Current minute window identifier: YYYY-MM-DDTHH:MM */
  private getMinuteWindow(): string {
    return new Date().toISOString().slice(0, 16);
  }

  /** Unix ms when the current minute window ends. */
  private getMinuteResetTime(): number {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 1);
    return now.getTime();
  }

  /** Current day window identifier: YYYY-MM-DD (UTC) */
  private getDayWindow(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Unix ms for start of next UTC day. */
  private getDayResetTime(): number {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }

  private getLimit(quota: TenantQuotas, resource: RateLimitResource): number {
    switch (resource) {
      case 'requests':
        return quota.requestsPerMinute;
      case 'workflows':
        return quota.maxConcurrentWorkflows;
      case 'plugins':
        return quota.pluginExecutionsPerDay === -1
          ? Number.MAX_SAFE_INTEGER
          : Math.ceil(quota.pluginExecutionsPerDay / 1440);
      default:
        return 100;
    }
  }
}
