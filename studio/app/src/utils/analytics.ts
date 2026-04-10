/**
 * @module @kb-labs/studio-app/utils/analytics
 * Analytics helpers for widget events, page views, and performance tracking
 */

import { createStudioLogger } from './logger';

const analyticsLogger = createStudioLogger('analytics');

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  enabled: boolean;
  trackPageViews: boolean;
  trackWidgetEvents: boolean;
  trackPerformance: boolean;
  trackErrors: boolean;
}

let analyticsConfig: AnalyticsConfig = {
  enabled: true,
  trackPageViews: true,
  trackWidgetEvents: true,
  trackPerformance: true,
  trackErrors: true,
};

/**
 * Set analytics configuration
 */
export function setAnalyticsConfig(config: Partial<AnalyticsConfig>): void {
  analyticsConfig = { ...analyticsConfig, ...config };
}

/**
 * Get analytics configuration
 */
export function getAnalyticsConfig(): AnalyticsConfig {
  return { ...analyticsConfig };
}

/**
 * Widget event types
 */
export type WidgetEventType =
  | 'mounted'
  | 'error'
  | 'interaction'
  | 'data-loaded'
  | 'data-error'
  | 'export'
  | 'refresh';

/**
 * Track widget event
 * Fire-and-forget, analytics failures should not break execution
 */
export function trackWidgetEvent(
  event: WidgetEventType,
  data: {
    widgetId: string;
    pluginId: string;
    code?: string;
    event?: string;
    duration?: number;
    exportFormat?: string;
  }
): void {
  if (!analyticsConfig.enabled || !analyticsConfig.trackWidgetEvents) {
    return;
  }

  try {
    // TODO: Integrate with @kb-labs/analytics-sdk-node
    // For now, just log
    analyticsLogger.info('Widget analytic event', {
      event,
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail - analytics should not break execution
    analyticsLogger.warn('Failed to track widget event', {
      event,
      data,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Track page view
 */
export function trackPageView(data: {
  path: string;
  title?: string;
  layoutId?: string;
  pluginId?: string;
}): void {
  if (!analyticsConfig.enabled || !analyticsConfig.trackPageViews) {
    return;
  }

  try {
    analyticsLogger.info('Page view', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail
    analyticsLogger.warn('Failed to track page view', {
      data,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Track performance metric
 */
export function trackPerformance(data: {
  metric: string;
  value: number;
  unit?: string;
  widgetId?: string;
  pluginId?: string;
}): void {
  if (!analyticsConfig.enabled || !analyticsConfig.trackPerformance) {
    return;
  }

  try {
    analyticsLogger.info('Performance metric', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail
    analyticsLogger.warn('Failed to track performance', {
      data,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Track error
 */
export function trackError(data: {
  error: Error | string;
  context?: string;
  widgetId?: string;
  pluginId?: string;
  metadata?: Record<string, unknown>;
}): void {
  if (!analyticsConfig.enabled || !analyticsConfig.trackErrors) {
    return;
  }

  try {
    const errorMessage = data.error instanceof Error ? data.error.message : data.error;
    const errorStack = data.error instanceof Error ? data.error.stack : undefined;

    analyticsLogger.error('Error tracked', {
      error: errorMessage,
      stack: errorStack,
      context: data.context,
      widgetId: data.widgetId,
      pluginId: data.pluginId,
      metadata: data.metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail
    analyticsLogger.warn('Failed to track error', {
      data,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}


