import type { EventHandler, EventMeta, EventRecord, Subscription } from './types.js';

const MAX_HISTORY = 100;

/**
 * Studio EventBus — pub/sub communication between plugin pages.
 *
 * Convention: events are namespaced as `pluginId:eventName`.
 * Built-in events: `studio:routeChanged`, `studio:themeChanged`.
 *
 * Singleton — shared across all pages via React context.
 */
export class StudioEventBus {
  private subscriptions = new Map<string, Set<Subscription>>();
  private history: EventRecord[] = [];
  private devToolsObserver?: (record: EventRecord) => void;

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  subscribe<T = unknown>(
    event: string,
    handler: EventHandler<T>,
    pluginId: string,
    pageId: string,
  ): () => void {
    const sub: Subscription = {
      event,
      handler: handler as EventHandler,
      pluginId,
      pageId,
    };

    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(sub);

    return () => {
      this.subscriptions.get(event)?.delete(sub);
    };
  }

  /**
   * Publish an event to all subscribers.
   */
  publish<T = unknown>(
    event: string,
    payload: T,
    sourcePluginId: string,
    sourcePageId: string,
  ): void {
    const meta: EventMeta = {
      sourcePluginId,
      sourcePageId,
      timestamp: Date.now(),
    };

    // Record for devtools
    const record: EventRecord = { event, payload, meta };
    this.history.push(record);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.devToolsObserver?.(record);

    const subs = this.subscriptions.get(event);
    if (!subs) { return; }

    for (const sub of subs) {
      try {
        sub.handler(payload, meta);
      } catch (err) {
        console.error(
          `[StudioEventBus] Handler error for "${event}" in ${sub.pluginId}:${sub.pageId}:`,
          err,
        );
      }
    }
  }

  /**
   * Unsubscribe all handlers for a specific page instance.
   * Called automatically on page unmount.
   */
  unsubscribeAll(pluginId: string, pageId: string): void {
    for (const [, subs] of this.subscriptions) {
      for (const sub of subs) {
        if (sub.pluginId === pluginId && sub.pageId === pageId) {
          subs.delete(sub);
        }
      }
    }
  }

  /**
   * Get event history for devtools.
   */
  getHistory(): readonly EventRecord[] {
    return this.history;
  }

  /**
   * Register a devtools observer that is called on every published event.
   * Only one observer at a time — intended for @kb-labs/studio-devtools only.
   */
  setDevToolsObserver(cb: (record: EventRecord) => void): void {
    this.devToolsObserver = cb;
  }

  clearDevToolsObserver(): void {
    this.devToolsObserver = undefined;
  }

  /**
   * Clear all subscriptions and history. For testing.
   */
  reset(): void {
    this.subscriptions.clear();
    this.history = [];
  }
}

/** Global singleton instance */
export const eventBus = new StudioEventBus();
