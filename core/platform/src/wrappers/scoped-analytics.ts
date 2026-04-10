/**
 * @module @kb-labs/core-platform/wrappers/scoped-analytics
 * Analytics wrapper that overrides source attribution for plugin execution
 *
 * Problem: All analytics events show source from root package.json (@kb-labs/ai-review)
 * Solution: Use IAnalytics.setSource() to override source.product with actual plugin ID
 *
 * Used by: core-sandbox/handler-executor to inject plugin-specific source
 */

import type {
  IAnalytics,
  EventsQuery,
  EventsResponse,
  EventsStats,
  BufferStatus,
  DlqStatus
} from '../adapters/analytics.js';

/**
 * ScopedAnalytics - wraps IAnalytics to override source attribution
 *
 * This wrapper uses the new setSource() method to modify the analytics
 * adapter's source before delegating all calls.
 *
 * Design:
 * - Calls setSource() on underlying adapter if available (FileAnalytics, future HTTP adapters)
 * - For adapters without setSource() (NoOpAnalytics), just delegates (no-op is fine)
 * - Transparently delegates all IAnalytics methods
 * - Safe to nest with other wrappers (AnalyticsEmbeddings, QueuedEmbeddings)
 *
 * Usage:
 * ```typescript
 * const scoped = new ScopedAnalytics(platform.analytics, {
 *   product: '@kb-labs/mind',
 *   version: '0.1.0'
 * });
 *
 * await scoped.track('mind.rag-index.started', { scope: 'default' });
 * // Event will have source.product = '@kb-labs/mind' instead of root package
 * ```
 */
export class ScopedAnalytics implements IAnalytics {
  constructor(
    private readonly realAnalytics: IAnalytics,
    private readonly scopedSource: { product: string; version: string }
  ) {
    // Try to override source in underlying adapter
    if (realAnalytics.setSource) {
      realAnalytics.setSource(scopedSource);
    }
    // If adapter doesn't support setSource (like NoOpAnalytics), that's fine
    // - NoOp doesn't track events anyway, so source doesn't matter
  }

  async track(event: string, properties?: Record<string, unknown>): Promise<void> {
    await this.realAnalytics.track(event, properties);
  }

  async identify(userId: string, traits?: Record<string, unknown>): Promise<void> {
    await this.realAnalytics.identify(userId, traits);
  }

  async flush(): Promise<void> {
    await this.realAnalytics.flush();
  }

  // Optional methods - delegate if available
  async getEvents(query?: EventsQuery): Promise<EventsResponse> {
    if (!this.realAnalytics.getEvents) {
      throw new Error('getEvents not supported by underlying analytics adapter');
    }
    return this.realAnalytics.getEvents(query);
  }

  async getStats(): Promise<EventsStats> {
    if (!this.realAnalytics.getStats) {
      throw new Error('getStats not supported by underlying analytics adapter');
    }
    return this.realAnalytics.getStats();
  }

  async getBufferStatus(): Promise<BufferStatus | null> {
    if (!this.realAnalytics.getBufferStatus) {
      return null;
    }
    return this.realAnalytics.getBufferStatus();
  }

  async getDlqStatus(): Promise<DlqStatus | null> {
    if (!this.realAnalytics.getDlqStatus) {
      return null;
    }
    return this.realAnalytics.getDlqStatus();
  }

  /**
   * Get current source from underlying adapter
   */
  getSource(): { product: string; version: string } | undefined {
    if (this.realAnalytics.getSource) {
      return this.realAnalytics.getSource();
    }
    // Fallback to our scoped source
    return this.scopedSource;
  }

  /**
   * Delegate setSource to underlying adapter
   */
  setSource(source: { product: string; version: string }): void {
    if (this.realAnalytics.setSource) {
      this.realAnalytics.setSource(source);
    }
    // Update our scoped source as well (for getScopedSource())
    (this as any).scopedSource = source;
  }

  /**
   * Get the scoped source (for testing/debugging)
   */
  getScopedSource(): { product: string; version: string } {
    return this.scopedSource;
  }

  /**
   * Get the underlying analytics adapter (for introspection)
   */
  getUnderlyingAdapter(): IAnalytics {
    return this.realAnalytics;
  }
}

/**
 * Create scoped analytics wrapper
 *
 * @param analytics - Original analytics adapter
 * @param scopedSource - Override source (plugin ID and version)
 * @returns Scoped analytics wrapper
 */
export function createScopedAnalytics(
  analytics: IAnalytics,
  scopedSource: { product: string; version: string }
): ScopedAnalytics {
  return new ScopedAnalytics(analytics, scopedSource);
}

/**
 * Check if adapter is already scoped
 */
export function isScopedAnalytics(analytics: IAnalytics): analytics is ScopedAnalytics {
  return analytics instanceof ScopedAnalytics;
}

/**
 * Unwrap scoped analytics to get original adapter
 */
export function unwrapScopedAnalytics(analytics: IAnalytics): IAnalytics {
  if (isScopedAnalytics(analytics)) {
    return analytics.getUnderlyingAdapter();
  }
  return analytics;
}
