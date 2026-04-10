/**
 * @module @kb-labs/tenant/rate-limiter
 * Tenant rate limiter using existing State Broker infrastructure
 *
 * Benefits:
 * - Zero new dependencies
 * - TTL cleanup already implemented (30s interval)
 * - Consistent with state management patterns
 * - Same backend as plugin state (in-memory or HTTP daemon)
 */

import type { StateBroker } from '@kb-labs/core-state-broker';
import type { TenantQuotas, TenantTier } from './types';
import { DEFAULT_QUOTAS } from './types';

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
 * Rate limit resource types
 */
export type RateLimitResource = 'requests' | 'workflows' | 'plugins';

/**
 * Tenant rate limiter
 * Uses State Broker for distributed rate limiting with TTL
 */
export class TenantRateLimiter {
  constructor(
    private broker: StateBroker,
    private quotas: Map<string, TenantQuotas> = new Map()
  ) {}

  /**
   * Check rate limit for a tenant
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource type to rate limit
   * @returns Rate limit check result
   *
   * @example
   * const result = await limiter.checkLimit('acme', 'requests');
   * if (!result.allowed) {
   *   throw new Error(`Rate limit exceeded. Reset at ${result.resetAt}`);
   * }
   */
  async checkLimit(
    tenantId: string,
    resource: RateLimitResource
  ): Promise<RateLimitResult> {
    const quota = this.quotas.get(tenantId) ?? DEFAULT_QUOTAS.free;

    // Key pattern: ratelimit:tenant:default:requests:2025-01-15T10:30
    // Follows existing namespace:key pattern from State Broker
    const key = `ratelimit:tenant:${tenantId}:${resource}:${this.getWindow()}`;

    const current = (await this.broker.get<number>(key)) ?? 0;
    const limit = this.getLimit(quota, resource);

    if (current >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: this.getResetTime(),
        limit,
      };
    }

    // Increment counter with 60s TTL
    // State Broker cleanup (30s interval) will remove expired entries
    await this.broker.set(key, current + 1, 60 * 1000);

    return {
      allowed: true,
      remaining: limit - current - 1,
      resetAt: this.getResetTime(),
      limit,
    };
  }

  /**
   * Set quotas for a tenant
   *
   * @param tenantId - Tenant identifier
   * @param quotas - Tenant quotas
   */
  setQuotas(tenantId: string, quotas: TenantQuotas): void {
    this.quotas.set(tenantId, quotas);
  }

  /**
   * Set quotas for a tenant tier
   *
   * @param tenantId - Tenant identifier
   * @param tier - Tenant tier
   */
  setTier(tenantId: string, tier: TenantTier): void {
    this.quotas.set(tenantId, { ...DEFAULT_QUOTAS[tier] });
  }

  /**
   * Get current window identifier (minute precision)
   * @returns ISO timestamp truncated to minutes
   */
  private getWindow(): string {
    return new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  }

  /**
   * Get limit for resource type
   *
   * @param quota - Tenant quotas
   * @param resource - Resource type
   * @returns Limit value
   */
  private getLimit(quota: TenantQuotas, resource: RateLimitResource): number {
    switch (resource) {
      case 'requests':
        return quota.requestsPerMinute;
      case 'workflows':
        return quota.maxConcurrentWorkflows;
      case 'plugins':
        // Convert daily limit to per-minute (1440 minutes in a day)
        return quota.pluginExecutionsPerDay === -1
          ? Number.MAX_SAFE_INTEGER
          : Math.ceil(quota.pluginExecutionsPerDay / 1440);
      default:
        return 100; // default fallback
    }
  }

  /**
   * Get reset time for current window
   * @returns Unix timestamp in milliseconds
   */
  private getResetTime(): number {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 1);
    return now.getTime();
  }
}
