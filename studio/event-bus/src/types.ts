/**
 * Metadata attached to every event.
 */
export interface EventMeta {
  /** Plugin that published the event */
  sourcePluginId: string;
  /** Page that published the event */
  sourcePageId: string;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event handler function.
 */
export type EventHandler<T = unknown> = (payload: T, meta: EventMeta) => void;

/**
 * Internal subscription record.
 */
export interface Subscription {
  event: string;
  handler: EventHandler;
  pluginId: string;
  pageId: string;
}

/**
 * Recorded event for debugging/devtools.
 */
export interface EventRecord {
  event: string;
  payload: unknown;
  meta: EventMeta;
}
