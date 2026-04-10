/**
 * Analytics event types for Mind CLI
 * Centralized constants to prevent typos and enable type safety
 */

/**
 * Event type prefixes by command
 */
export const ANALYTICS_PREFIX = {
  QUERY: 'mind.query',
  FEED: 'mind.feed',
  UPDATE: 'mind.update',
  INIT: 'mind.init',
  PACK: 'mind.pack',
  VERIFY: 'mind.verify',
} as const;

/**
 * Event lifecycle suffixes
 */
export const ANALYTICS_SUFFIX = {
  STARTED: 'started',
  FINISHED: 'finished',
} as const;

/**
 * Mind analytics event types
 */
export const ANALYTICS_EVENTS = {
  // Query events
  QUERY_STARTED: `${ANALYTICS_PREFIX.QUERY}.${ANALYTICS_SUFFIX.STARTED}`,
  QUERY_FINISHED: `${ANALYTICS_PREFIX.QUERY}.${ANALYTICS_SUFFIX.FINISHED}`,

  // Feed events
  FEED_STARTED: `${ANALYTICS_PREFIX.FEED}.${ANALYTICS_SUFFIX.STARTED}`,
  FEED_FINISHED: `${ANALYTICS_PREFIX.FEED}.${ANALYTICS_SUFFIX.FINISHED}`,

  // Update events
  UPDATE_STARTED: `${ANALYTICS_PREFIX.UPDATE}.${ANALYTICS_SUFFIX.STARTED}`,
  UPDATE_FINISHED: `${ANALYTICS_PREFIX.UPDATE}.${ANALYTICS_SUFFIX.FINISHED}`,

  // Init events
  INIT_STARTED: `${ANALYTICS_PREFIX.INIT}.${ANALYTICS_SUFFIX.STARTED}`,
  INIT_FINISHED: `${ANALYTICS_PREFIX.INIT}.${ANALYTICS_SUFFIX.FINISHED}`,

  // Pack events
  PACK_STARTED: `${ANALYTICS_PREFIX.PACK}.${ANALYTICS_SUFFIX.STARTED}`,
  PACK_FINISHED: `${ANALYTICS_PREFIX.PACK}.${ANALYTICS_SUFFIX.FINISHED}`,

  // Verify events
  VERIFY_STARTED: `${ANALYTICS_PREFIX.VERIFY}.${ANALYTICS_SUFFIX.STARTED}`,
  VERIFY_FINISHED: `${ANALYTICS_PREFIX.VERIFY}.${ANALYTICS_SUFFIX.FINISHED}`,
} as const;

/**
 * Type helper for analytics event types
 */
export type AnalyticsEventType = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];

/**
 * Actor configuration for Mind analytics
 */
export const ANALYTICS_ACTOR = {
  type: 'agent' as const,
  id: 'mind-cli',
} as const;

