/**
 * @module @kb-labs/core-resource-broker/rate-limit/in-memory-backend
 * In-memory implementation of RateLimitBackend for single-process deployments.
 */

import type {
  RateLimitBackend,
  RateLimitConfig,
  RateLimitStats,
  AcquireResult,
} from '../types.js';

/**
 * Internal state for a single resource.
 */
interface ResourceState {
  // Window tracking
  tokensThisMinute: number;
  requestsThisMinute: number;
  requestsThisSecond: number;
  activeRequests: number;

  // Window timestamps
  minuteWindowStart: number;
  secondWindowStart: number;

  // Stats
  totalRequests: number;
  totalTokens: number;
  waitCount: number;
  totalWaitTime: number;
}

/**
 * In-memory rate limit backend.
 *
 * Uses sliding window approach for TPM/RPM/RPS tracking.
 * Suitable for single-process deployments.
 *
 * @example
 * ```typescript
 * const backend = new InMemoryRateLimitBackend();
 *
 * const result = await backend.acquire('llm', 1000, {
 *   tokensPerMinute: 100000,
 *   requestsPerMinute: 1000,
 * });
 *
 * if (result.allowed) {
 *   // Execute request
 *   await backend.release('llm');
 * } else {
 *   // Wait and retry
 *   await sleep(result.waitTimeMs);
 * }
 * ```
 */
export class InMemoryRateLimitBackend implements RateLimitBackend {
  private states = new Map<string, ResourceState>();

  /**
   * Get or create state for a resource.
   */
  private getState(resource: string): ResourceState {
    let state = this.states.get(resource);
    if (!state) {
      const now = Date.now();
      state = {
        tokensThisMinute: 0,
        requestsThisMinute: 0,
        requestsThisSecond: 0,
        activeRequests: 0,
        minuteWindowStart: now,
        secondWindowStart: now,
        totalRequests: 0,
        totalTokens: 0,
        waitCount: 0,
        totalWaitTime: 0,
      };
      this.states.set(resource, state);
    }
    return state;
  }

  /**
   * Reset windows if time has passed.
   */
  private resetWindowsIfNeeded(state: ResourceState): void {
    const now = Date.now();

    // Reset minute window
    if (now - state.minuteWindowStart >= 60_000) {
      state.tokensThisMinute = 0;
      state.requestsThisMinute = 0;
      state.minuteWindowStart = now;
    }

    // Reset second window
    if (now - state.secondWindowStart >= 1_000) {
      state.requestsThisSecond = 0;
      state.secondWindowStart = now;
    }
  }

  /**
   * Check if all limits allow proceeding.
   */
  private checkLimits(
    state: ResourceState,
    tokens: number,
    config: RateLimitConfig
  ): { allowed: boolean; waitTimeMs?: number } {
    const now = Date.now();
    const safetyMargin = config.safetyMargin ?? 0.9;

    // Apply safety margin to limits
    const effectiveTPM = config.tokensPerMinute
      ? Math.floor(config.tokensPerMinute * safetyMargin)
      : undefined;
    const effectiveRPM = config.requestsPerMinute
      ? Math.floor(config.requestsPerMinute * safetyMargin)
      : undefined;
    const effectiveRPS = config.requestsPerSecond
      ? Math.floor(config.requestsPerSecond * safetyMargin)
      : undefined;

    const delays: number[] = [];

    // Check TPM
    if (effectiveTPM !== undefined && state.tokensThisMinute + tokens > effectiveTPM) {
      const timeUntilMinuteReset = 60_000 - (now - state.minuteWindowStart);
      delays.push(Math.max(100, timeUntilMinuteReset + 100));
    }

    // Check RPM
    if (effectiveRPM !== undefined && state.requestsThisMinute >= effectiveRPM) {
      const timeUntilMinuteReset = 60_000 - (now - state.minuteWindowStart);
      delays.push(Math.max(100, timeUntilMinuteReset + 100));
    }

    // Check RPS
    if (effectiveRPS !== undefined && state.requestsThisSecond >= effectiveRPS) {
      const timeUntilSecondReset = 1_000 - (now - state.secondWindowStart);
      delays.push(Math.max(50, timeUntilSecondReset + 50));
    }

    // Check concurrent requests
    if (
      config.maxConcurrentRequests !== undefined &&
      state.activeRequests >= config.maxConcurrentRequests
    ) {
      delays.push(100); // Check every 100ms for slot availability
    }

    if (delays.length > 0) {
      return { allowed: false, waitTimeMs: Math.min(...delays) };
    }

    return { allowed: true };
  }

  /**
   * @inheritdoc
   */
  async acquire(
    resource: string,
    tokens: number,
    config: RateLimitConfig
  ): Promise<AcquireResult> {
    const state = this.getState(resource);
    this.resetWindowsIfNeeded(state);

    const check = this.checkLimits(state, tokens, config);

    if (!check.allowed) {
      state.waitCount++;
      state.totalWaitTime += check.waitTimeMs ?? 0;

      // Calculate remaining capacity
      const safetyMargin = config.safetyMargin ?? 0.9;
      const effectiveTPM = config.tokensPerMinute
        ? Math.floor(config.tokensPerMinute * safetyMargin)
        : undefined;
      const effectiveRPM = config.requestsPerMinute
        ? Math.floor(config.requestsPerMinute * safetyMargin)
        : undefined;

      return {
        allowed: false,
        waitTimeMs: check.waitTimeMs,
        tokensRemaining: effectiveTPM
          ? Math.max(0, effectiveTPM - state.tokensThisMinute)
          : undefined,
        requestsRemaining: effectiveRPM
          ? Math.max(0, effectiveRPM - state.requestsThisMinute)
          : undefined,
        activeRequests: state.activeRequests,
      };
    }

    // Reserve capacity
    state.tokensThisMinute += tokens;
    state.requestsThisMinute++;
    state.requestsThisSecond++;
    state.activeRequests++;
    state.totalRequests++;
    state.totalTokens += tokens;

    // Calculate remaining capacity
    const safetyMargin = config.safetyMargin ?? 0.9;
    const effectiveTPM = config.tokensPerMinute
      ? Math.floor(config.tokensPerMinute * safetyMargin)
      : undefined;
    const effectiveRPM = config.requestsPerMinute
      ? Math.floor(config.requestsPerMinute * safetyMargin)
      : undefined;

    return {
      allowed: true,
      tokensRemaining: effectiveTPM
        ? Math.max(0, effectiveTPM - state.tokensThisMinute)
        : undefined,
      requestsRemaining: effectiveRPM
        ? Math.max(0, effectiveRPM - state.requestsThisMinute)
        : undefined,
      activeRequests: state.activeRequests,
    };
  }

  /**
   * @inheritdoc
   */
  async release(resource: string): Promise<void> {
    const state = this.states.get(resource);
    if (state) {
      state.activeRequests = Math.max(0, state.activeRequests - 1);
    }
  }

  /**
   * @inheritdoc
   */
  async getStats(resource: string): Promise<RateLimitStats> {
    const state = this.getState(resource);
    this.resetWindowsIfNeeded(state);

    return {
      resource,
      tokensThisMinute: state.tokensThisMinute,
      requestsThisMinute: state.requestsThisMinute,
      requestsThisSecond: state.requestsThisSecond,
      activeRequests: state.activeRequests,
      totalRequests: state.totalRequests,
      totalTokens: state.totalTokens,
      waitCount: state.waitCount,
      totalWaitTime: state.totalWaitTime,
    };
  }

  /**
   * @inheritdoc
   */
  async reset(resource: string): Promise<void> {
    this.states.delete(resource);
  }

  /**
   * Reset all resources.
   */
  resetAll(): void {
    this.states.clear();
  }
}
