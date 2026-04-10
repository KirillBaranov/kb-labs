/**
 * @module @kb-labs/mind-engine/rate-limiting/rate-limiter
 *
 * Universal rate limiter that works with any provider.
 * Supports TPM, RPM, RPS, and concurrency limits.
 */

import type { RateLimitConfig } from './rate-limit-config';

export interface RateLimiterStats {
  /** Tokens used in current minute window */
  tokensThisMinute: number;
  /** Requests made in current minute window */
  requestsThisMinute: number;
  /** Requests made in current second window */
  requestsThisSecond: number;
  /** Currently active requests */
  activeRequests: number;
  /** Total requests made */
  totalRequests: number;
  /** Total tokens used */
  totalTokens: number;
  /** Number of times we had to wait for capacity */
  waitCount: number;
  /** Total time spent waiting (ms) */
  totalWaitTime: number;
}

/**
 * Universal Rate Limiter
 *
 * Tracks usage across multiple dimensions:
 * - Tokens per minute (TPM)
 * - Requests per minute (RPM)
 * - Requests per second (RPS)
 * - Concurrent requests
 *
 * Before making a request, call acquire() with estimated tokens.
 * After request completes, call release().
 */
export class RateLimiter {
  // Window tracking
  private tokensThisMinute = 0;
  private requestsThisMinute = 0;
  private requestsThisSecond = 0;
  private activeRequests = 0;

  // Window timestamps
  private minuteWindowStart = Date.now();
  private secondWindowStart = Date.now();

  // Stats
  private totalRequests = 0;
  private totalTokens = 0;
  private waitCount = 0;
  private totalWaitTime = 0;

  // Effective limits (with safety margin applied)
  private readonly effectiveTPM: number | undefined;
  private readonly effectiveRPM: number | undefined;
  private readonly effectiveRPS: number | undefined;
  private readonly maxConcurrent: number | undefined;
  private readonly safetyMargin: number;

  constructor(private config: RateLimitConfig) {
    this.safetyMargin = config.safetyMargin ?? 0.9;

    // Apply safety margin to limits
    if (config.tokensPerMinute) {
      this.effectiveTPM = Math.floor(config.tokensPerMinute * this.safetyMargin);
    }
    if (config.requestsPerMinute) {
      this.effectiveRPM = Math.floor(config.requestsPerMinute * this.safetyMargin);
    }
    if (config.requestsPerSecond) {
      this.effectiveRPS = Math.floor(config.requestsPerSecond * this.safetyMargin);
    }
    this.maxConcurrent = config.maxConcurrentRequests;
  }

  /**
   * Acquire capacity for a request.
   * Blocks until capacity is available.
   *
   * @param estimatedTokens Estimated token count for this request
   */
  async acquire(estimatedTokens: number): Promise<void> {
    const startWait = Date.now();
    let waited = false;

    while (true) {
      this.resetWindowsIfNeeded();

      const canProceed = this.checkLimits(estimatedTokens);
      if (canProceed) {
        break;
      }

      waited = true;
      const waitTime = this.calculateWaitTime(estimatedTokens);
      await this.sleep(waitTime);
    }

    // Reserve capacity
    this.tokensThisMinute += estimatedTokens;
    this.requestsThisMinute++;
    this.requestsThisSecond++;
    this.activeRequests++;
    this.totalRequests++;
    this.totalTokens += estimatedTokens;

    if (waited) {
      this.waitCount++;
      this.totalWaitTime += Date.now() - startWait;
    }
  }

  /**
   * Release a slot after request completes.
   * Only affects concurrent request tracking.
   */
  release(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  /**
   * Check if a request can proceed without waiting.
   */
  canProceed(estimatedTokens: number): boolean {
    this.resetWindowsIfNeeded();
    return this.checkLimits(estimatedTokens);
  }

  /**
   * Get current rate limiter statistics.
   */
  getStats(): RateLimiterStats {
    this.resetWindowsIfNeeded();
    return {
      tokensThisMinute: this.tokensThisMinute,
      requestsThisMinute: this.requestsThisMinute,
      requestsThisSecond: this.requestsThisSecond,
      activeRequests: this.activeRequests,
      totalRequests: this.totalRequests,
      totalTokens: this.totalTokens,
      waitCount: this.waitCount,
      totalWaitTime: this.totalWaitTime,
    };
  }

  /**
   * Get remaining capacity in current windows.
   */
  getRemainingCapacity(): {
    tokensRemaining: number | undefined;
    requestsPerMinuteRemaining: number | undefined;
    requestsPerSecondRemaining: number | undefined;
    concurrentSlotsRemaining: number | undefined;
  } {
    this.resetWindowsIfNeeded();
    return {
      tokensRemaining: this.effectiveTPM
        ? Math.max(0, this.effectiveTPM - this.tokensThisMinute)
        : undefined,
      requestsPerMinuteRemaining: this.effectiveRPM
        ? Math.max(0, this.effectiveRPM - this.requestsThisMinute)
        : undefined,
      requestsPerSecondRemaining: this.effectiveRPS
        ? Math.max(0, this.effectiveRPS - this.requestsThisSecond)
        : undefined,
      concurrentSlotsRemaining: this.maxConcurrent
        ? Math.max(0, this.maxConcurrent - this.activeRequests)
        : undefined,
    };
  }

  /**
   * Calculate optimal batch size based on remaining capacity.
   */
  getOptimalBatchSize(
    avgTokensPerItem: number,
    maxBatchSize: number
  ): number {
    this.resetWindowsIfNeeded();

    // Start with max
    let optimalSize = maxBatchSize;

    // Limit by remaining TPM
    if (this.effectiveTPM) {
      const tokensRemaining = Math.max(0, this.effectiveTPM - this.tokensThisMinute);
      const itemsByTokens = Math.floor(tokensRemaining / avgTokensPerItem);
      optimalSize = Math.min(optimalSize, itemsByTokens);
    }

    // Ensure at least 1 item (or 0 if no capacity)
    return Math.max(0, optimalSize);
  }

  /**
   * Reset windows if time has passed.
   */
  private resetWindowsIfNeeded(): void {
    const now = Date.now();

    // Reset minute window
    if (now - this.minuteWindowStart >= 60_000) {
      this.tokensThisMinute = 0;
      this.requestsThisMinute = 0;
      this.minuteWindowStart = now;
    }

    // Reset second window
    if (now - this.secondWindowStart >= 1_000) {
      this.requestsThisSecond = 0;
      this.secondWindowStart = now;
    }
  }

  /**
   * Check if all limits allow proceeding.
   */
  private checkLimits(estimatedTokens: number): boolean {
    // Check TPM
    if (this.effectiveTPM) {
      if (this.tokensThisMinute + estimatedTokens > this.effectiveTPM) {
        return false;
      }
    }

    // Check RPM
    if (this.effectiveRPM) {
      if (this.requestsThisMinute >= this.effectiveRPM) {
        return false;
      }
    }

    // Check RPS
    if (this.effectiveRPS) {
      if (this.requestsThisSecond >= this.effectiveRPS) {
        return false;
      }
    }

    // Check concurrent requests
    if (this.maxConcurrent) {
      if (this.activeRequests >= this.maxConcurrent) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate how long to wait before checking again.
   */
  private calculateWaitTime(estimatedTokens: number): number {
    const now = Date.now();
    const delays: number[] = [];

    // If TPM exceeded, wait for minute window reset
    if (this.effectiveTPM && this.tokensThisMinute + estimatedTokens > this.effectiveTPM) {
      const timeUntilMinuteReset = 60_000 - (now - this.minuteWindowStart);
      delays.push(Math.max(100, timeUntilMinuteReset + 100));
    }

    // If RPM exceeded, wait for minute window reset
    if (this.effectiveRPM && this.requestsThisMinute >= this.effectiveRPM) {
      const timeUntilMinuteReset = 60_000 - (now - this.minuteWindowStart);
      delays.push(Math.max(100, timeUntilMinuteReset + 100));
    }

    // If RPS exceeded, wait for second window reset
    if (this.effectiveRPS && this.requestsThisSecond >= this.effectiveRPS) {
      const timeUntilSecondReset = 1_000 - (now - this.secondWindowStart);
      delays.push(Math.max(50, timeUntilSecondReset + 50));
    }

    // If concurrent limit hit, poll frequently
    if (this.maxConcurrent && this.activeRequests >= this.maxConcurrent) {
      delays.push(100); // Check every 100ms for slot availability
    }

    // Return minimum wait time (but at least 50ms to avoid busy-waiting)
    return delays.length > 0 ? Math.min(...delays) : 50;
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => { setTimeout(resolve, ms); });
  }
}

/**
 * Create a rate limiter from config.
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}
