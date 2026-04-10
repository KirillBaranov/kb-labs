/**
 * @module @kb-labs/shared-command-kit/helpers/use-analytics
 * Global analytics access helper
 *
 * Provides clean access to analytics/telemetry without context drilling.
 *
 * @example
 * ```typescript
 * import { useAnalytics } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const analytics = useAnalytics();
 *
 *   if (analytics) {
 *     await analytics.track('release_started', { version: '1.0.0' });
 *     analytics.metric('release_duration_ms', 1234);
 *   }
 * }
 * ```
 */

import { usePlatform } from './use-platform';
import type { IAnalytics } from '@kb-labs/core-platform';

/**
 * Access global analytics adapter
 *
 * Returns the platform analytics adapter for tracking events and metrics.
 * Returns undefined if analytics is not configured (graceful degradation).
 *
 * **Methods:**
 * - `analytics.track(event, properties?)` - Track events
 * - `analytics.metric(name, value, tags?)` - Record metrics
 *
 * **Always check availability:**
 * ```typescript
 * const analytics = useAnalytics();
 * if (analytics) {
 *   await analytics.track('event');
 * }
 * ```
 *
 * @returns Analytics adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * const analytics = useAnalytics();
 *
 * if (analytics) {
 *   await analytics.track('command_executed', {
 *     command: 'release:run',
 *     duration_ms: 1234,
 *     success: true,
 *   });
 *
 *   analytics.metric('release_packages_count', 5, {
 *     project: 'kb-labs',
 *   });
 * }
 * ```
 */
export function useAnalytics(): IAnalytics | undefined {
  const platform = usePlatform();
  return platform.analytics;
}

/**
 * Track event with analytics (safe, global singleton)
 *
 * Convenience wrapper that uses global platform analytics.
 * Does nothing if analytics is not configured.
 *
 * NOTE: For context-based analytics, use trackEvent() from '../analytics/with-analytics'.
 * This helper uses global singleton, not request-scoped context.
 *
 * @param event - Event name
 * @param properties - Event properties
 *
 * @example
 * ```typescript
 * import { trackAnalyticsEvent } from '@kb-labs/shared-command-kit/helpers';
 *
 * // No need to check if analytics exists
 * await trackAnalyticsEvent('release_completed', { version: '1.0.0', packages: 5 });
 * ```
 */
export async function trackAnalyticsEvent(
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const analytics = useAnalytics();
  if (analytics) {
    await analytics.track(event, properties);
  }
}
