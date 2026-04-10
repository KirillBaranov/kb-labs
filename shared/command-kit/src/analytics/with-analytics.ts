/**
 * Analytics Wrapper
 *
 * Optional helper for wrapping operations with analytics events.
 * You can always use ctx.platform.analytics.track() directly - this is just convenience.
 *
 * @example
 * ```typescript
 * import { withAnalytics } from '@kb-labs/shared-command-kit';
 *
 * const result = await withAnalytics(ctx, 'mind.query', {
 *   started: { queryId, text, mode },
 *   completed: (result) => ({ tokensIn: result.tokensIn, tokensOut: result.tokensOut }),
 *   failed: (error) => ({ errorMessage: error.message }),
 * }, async () => {
 *   return await executeQuery(...);
 * });
 * ```
 */

import type { IAnalytics } from '@kb-labs/core-platform';

/**
 * Context with optional analytics
 */
export interface AnalyticsContext {
  platform?: {
    analytics?: IAnalytics;
  };
}

/**
 * Analytics event configuration
 */
export interface AnalyticsEvents<TResult> {
  /** Event properties when operation starts */
  started?: Record<string, unknown>;
  /** Event properties when operation completes (can be function of result) */
  completed?: Record<string, unknown> | ((result: TResult) => Record<string, unknown>);
  /** Event properties when operation fails (can be function of error) */
  failed?: Record<string, unknown> | ((error: Error) => Record<string, unknown>);
}

/**
 * Wrap an async operation with analytics tracking
 *
 * Automatically tracks:
 * - `{eventName}.started` when operation begins
 * - `{eventName}.completed` when operation succeeds
 * - `{eventName}.failed` when operation fails
 *
 * @param ctx - Context with platform.analytics
 * @param eventName - Base event name (e.g., 'mind.query', 'workflow.run')
 * @param events - Event properties for started/completed/failed events
 * @param operation - Async operation to execute
 * @returns Result of the operation
 *
 * @example
 * ```typescript
 * const result = await withAnalytics(ctx, 'mind.query', {
 *   started: { queryId: '123', text: 'search query' },
 *   completed: (result) => ({
 *     tokensIn: result.tokensIn,
 *     tokensOut: result.tokensOut,
 *     resultsCount: result.results.length,
 *   }),
 *   failed: (error) => ({
 *     errorCode: error.code,
 *     errorMessage: error.message,
 *   }),
 * }, async () => {
 *   return await executeQuery('search query');
 * });
 * ```
 */
export async function withAnalytics<TResult>(
  ctx: AnalyticsContext,
  eventName: string,
  events: AnalyticsEvents<TResult>,
  operation: () => Promise<TResult>
): Promise<TResult> {
  const analytics = ctx.platform?.analytics;
  const startTime = Date.now();

  // Track started event
  if (analytics && events.started) {
    await analytics.track(`${eventName}.started`, {
      ...events.started,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Execute operation
    const result = await operation();

    // Track completed event
    if (analytics && events.completed) {
      const completedProps = typeof events.completed === 'function'
        ? events.completed(result)
        : events.completed;

      await analytics.track(`${eventName}.completed`, {
        ...completedProps,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  } catch (error: any) {
    // Track failed event
    if (analytics && events.failed) {
      const failedProps = typeof events.failed === 'function'
        ? events.failed(error)
        : events.failed;

      await analytics.track(`${eventName}.failed`, {
        ...failedProps,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    // Re-throw error
    throw error;
  }
}

/**
 * Create a reusable analytics wrapper for a specific event
 *
 * @param eventName - Base event name
 * @param defaultEvents - Default event properties
 * @returns Function that wraps operations with analytics
 *
 * @example
 * ```typescript
 * const trackQuery = createAnalyticsWrapper('mind.query', {
 *   started: { source: 'cli' },
 *   completed: (result) => ({ resultsCount: result.results.length }),
 * });
 *
 * // Use multiple times
 * const result1 = await trackQuery(ctx, { text: 'query 1' }, async () => {...});
 * const result2 = await trackQuery(ctx, { text: 'query 2' }, async () => {...});
 * ```
 */
export function createAnalyticsWrapper<TResult>(
  eventName: string,
  defaultEvents: AnalyticsEvents<TResult>
) {
  return async (
    ctx: AnalyticsContext,
    additionalEvents: Partial<AnalyticsEvents<TResult>>,
    operation: () => Promise<TResult>
  ): Promise<TResult> => {
    const mergedEvents: AnalyticsEvents<TResult> = {
      started: { ...defaultEvents.started, ...additionalEvents.started },
      completed: additionalEvents.completed || defaultEvents.completed,
      failed: additionalEvents.failed || defaultEvents.failed,
    };

    return withAnalytics(ctx, eventName, mergedEvents, operation);
  };
}

/**
 * Track a simple event (no wrapping)
 *
 * Convenience helper for tracking single events without wrapping an operation.
 *
 * @param ctx - Context with platform.analytics
 * @param eventName - Event name
 * @param properties - Event properties
 *
 * @example
 * ```typescript
 * await trackEvent(ctx, 'button.clicked', { buttonId: 'submit', page: 'settings' });
 * ```
 */
export async function trackEvent(
  ctx: AnalyticsContext,
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const analytics = ctx.platform?.analytics;

  if (analytics) {
    await analytics.track(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  }
}
