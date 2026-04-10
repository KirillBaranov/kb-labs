/**
 * @module @kb-labs/core-resource-broker/rate-limit/state-broker-backend
 * Distributed rate limit backend using StateBroker.
 *
 * Enables horizontal scaling by storing rate counters in a shared StateBroker
 * (HTTP daemon or future Redis backend).
 */

import type { StateBroker } from '@kb-labs/core-state-broker';
import type {
  RateLimitBackend,
  RateLimitConfig,
  RateLimitStats,
  AcquireResult,
} from '../types.js';

/**
 * State stored in StateBroker for each resource window.
 */
interface WindowState {
  tokens: number;
  requests: number;
  activeRequests: number;
  updatedAt: number;
}

/**
 * Cumulative stats stored in StateBroker.
 */
interface CumulativeStats {
  totalRequests: number;
  totalTokens: number;
  waitCount: number;
  totalWaitTime: number;
}

/**
 * Distributed rate limit backend using StateBroker.
 *
 * Key patterns:
 * - `ratelimit:{resource}:minute:{YYYY-MM-DDTHH:MM}` - Minute window counters
 * - `ratelimit:{resource}:second:{YYYY-MM-DDTHH:MM:SS}` - Second window counters
 * - `ratelimit:{resource}:active` - Active concurrent requests
 * - `ratelimit:{resource}:stats` - Cumulative statistics
 *
 * TTL strategy:
 * - Minute windows: 120s TTL (allows for clock skew)
 * - Second windows: 10s TTL
 * - Active counter: No TTL (managed explicitly)
 * - Stats: No TTL (persisted)
 *
 * @example
 * ```typescript
 * import { createStateBroker } from '@kb-labs/core-state-broker';
 *
 * const broker = createStateBroker({ backend: 'http', url: 'http://localhost:7777' });
 * const backend = new StateBrokerRateLimitBackend(broker);
 *
 * // Now rate limits are coordinated across all processes using the same daemon
 * ```
 */
export class StateBrokerRateLimitBackend implements RateLimitBackend {
  constructor(private broker: StateBroker) {}

  /**
   * Get current minute window key.
   */
  private getMinuteKey(resource: string): string {
    const window = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    return `ratelimit:${resource}:minute:${window}`;
  }

  /**
   * Get current second window key.
   */
  private getSecondKey(resource: string): string {
    const window = new Date().toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
    return `ratelimit:${resource}:second:${window}`;
  }

  /**
   * Get active requests key.
   */
  private getActiveKey(resource: string): string {
    return `ratelimit:${resource}:active`;
  }

  /**
   * Get stats key.
   */
  private getStatsKey(resource: string): string {
    return `ratelimit:${resource}:stats`;
  }

  /**
   * Get or initialize window state.
   */
  private async getWindowState(key: string): Promise<WindowState> {
    const state = await this.broker.get<WindowState>(key);
    return state ?? { tokens: 0, requests: 0, activeRequests: 0, updatedAt: Date.now() };
  }

  /**
   * Get or initialize stats.
   */
  private async getCumulativeStats(resource: string): Promise<CumulativeStats> {
    const stats = await this.broker.get<CumulativeStats>(this.getStatsKey(resource));
    return stats ?? { totalRequests: 0, totalTokens: 0, waitCount: 0, totalWaitTime: 0 };
  }

  /**
   * @inheritdoc
   */
  async acquire(
    resource: string,
    tokens: number,
    config: RateLimitConfig
  ): Promise<AcquireResult> {
    const safetyMargin = config.safetyMargin ?? 0.9;

    // Get current state from all windows
    const [minuteState, secondState, activeCount] = await Promise.all([
      this.getWindowState(this.getMinuteKey(resource)),
      this.getWindowState(this.getSecondKey(resource)),
      this.broker.get<number>(this.getActiveKey(resource)).then(v => v ?? 0),
    ]);

    // Calculate effective limits
    const effectiveTPM = config.tokensPerMinute
      ? Math.floor(config.tokensPerMinute * safetyMargin)
      : undefined;
    const effectiveRPM = config.requestsPerMinute
      ? Math.floor(config.requestsPerMinute * safetyMargin)
      : undefined;
    const effectiveRPS = config.requestsPerSecond
      ? Math.floor(config.requestsPerSecond * safetyMargin)
      : undefined;

    // Check limits
    const delays: number[] = [];
    const now = Date.now();

    // Check TPM
    if (effectiveTPM && minuteState.tokens + tokens > effectiveTPM) {
      // Wait until next minute
      const secondsRemaining = 60 - new Date().getSeconds();
      delays.push(secondsRemaining * 1000 + 100);
    }

    // Check RPM
    if (effectiveRPM && minuteState.requests >= effectiveRPM) {
      const secondsRemaining = 60 - new Date().getSeconds();
      delays.push(secondsRemaining * 1000 + 100);
    }

    // Check RPS
    if (effectiveRPS && secondState.requests >= effectiveRPS) {
      const msRemaining = 1000 - new Date().getMilliseconds();
      delays.push(msRemaining + 50);
    }

    // Check concurrent
    if (config.maxConcurrentRequests && activeCount >= config.maxConcurrentRequests) {
      delays.push(100);
    }

    if (delays.length > 0) {
      // Update wait stats
      const stats = await this.getCumulativeStats(resource);
      stats.waitCount++;
      stats.totalWaitTime += Math.min(...delays);
      await this.broker.set(this.getStatsKey(resource), stats);

      return {
        allowed: false,
        waitTimeMs: Math.min(...delays),
        tokensRemaining: effectiveTPM
          ? Math.max(0, effectiveTPM - minuteState.tokens)
          : undefined,
        requestsRemaining: effectiveRPM
          ? Math.max(0, effectiveRPM - minuteState.requests)
          : undefined,
        activeRequests: activeCount,
      };
    }

    // Reserve capacity - update all windows atomically as possible
    const minuteKey = this.getMinuteKey(resource);
    const secondKey = this.getSecondKey(resource);
    const activeKey = this.getActiveKey(resource);
    const statsKey = this.getStatsKey(resource);

    // Update minute window
    const newMinuteState: WindowState = {
      tokens: minuteState.tokens + tokens,
      requests: minuteState.requests + 1,
      activeRequests: activeCount + 1,
      updatedAt: now,
    };
    await this.broker.set(minuteKey, newMinuteState, 120_000); // 2 min TTL

    // Update second window
    const newSecondState: WindowState = {
      tokens: secondState.tokens + tokens,
      requests: secondState.requests + 1,
      activeRequests: activeCount + 1,
      updatedAt: now,
    };
    await this.broker.set(secondKey, newSecondState, 10_000); // 10s TTL

    // Update active count
    await this.broker.set(activeKey, activeCount + 1);

    // Update cumulative stats
    const stats = await this.getCumulativeStats(resource);
    stats.totalRequests++;
    stats.totalTokens += tokens;
    await this.broker.set(statsKey, stats);

    return {
      allowed: true,
      tokensRemaining: effectiveTPM
        ? Math.max(0, effectiveTPM - newMinuteState.tokens)
        : undefined,
      requestsRemaining: effectiveRPM
        ? Math.max(0, effectiveRPM - newMinuteState.requests)
        : undefined,
      activeRequests: activeCount + 1,
    };
  }

  /**
   * @inheritdoc
   */
  async release(resource: string): Promise<void> {
    const activeKey = this.getActiveKey(resource);
    const current = await this.broker.get<number>(activeKey);
    if (current !== null && current > 0) {
      await this.broker.set(activeKey, current - 1);
    }
  }

  /**
   * @inheritdoc
   */
  async getStats(resource: string): Promise<RateLimitStats> {
    const [minuteState, secondState, activeCount, cumulativeStats] = await Promise.all([
      this.getWindowState(this.getMinuteKey(resource)),
      this.getWindowState(this.getSecondKey(resource)),
      this.broker.get<number>(this.getActiveKey(resource)).then(v => v ?? 0),
      this.getCumulativeStats(resource),
    ]);

    return {
      resource,
      tokensThisMinute: minuteState.tokens,
      requestsThisMinute: minuteState.requests,
      requestsThisSecond: secondState.requests,
      activeRequests: activeCount,
      totalRequests: cumulativeStats.totalRequests,
      totalTokens: cumulativeStats.totalTokens,
      waitCount: cumulativeStats.waitCount,
      totalWaitTime: cumulativeStats.totalWaitTime,
    };
  }

  /**
   * @inheritdoc
   */
  async reset(resource: string): Promise<void> {
    // Clear all keys for this resource
    await Promise.all([
      this.broker.clear(`ratelimit:${resource}:*`),
    ]);
  }
}
