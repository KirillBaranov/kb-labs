/**
 * @module @kb-labs/core-platform/noop/adapters/event-bus
 * In-memory event bus implementation.
 */

import type { IEventBus, EventHandler, Unsubscribe } from '../../adapters/event-bus.js';

/**
 * In-memory event bus using Map of handlers.
 * Events are processed synchronously in order of subscription.
 */
export class MemoryEventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler<unknown>>>();

  async publish<T>(topic: string, event: T): Promise<void> {
    const topicHandlers = this.handlers.get(topic);
    if (!topicHandlers) {
      return;
    }

    // Execute all handlers (in parallel for better performance)
    const promises = Array.from(topicHandlers).map((handler) =>
      handler(event).catch((err) => {
        console.error(`[EventBus] Handler error for topic "${topic}":`, err);
      })
    );

    await Promise.all(promises);
  }

  subscribe<T>(topic: string, handler: EventHandler<T>): Unsubscribe {
    let topicHandlers = this.handlers.get(topic);
    if (!topicHandlers) {
      topicHandlers = new Set();
      this.handlers.set(topic, topicHandlers);
    }

    topicHandlers.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      topicHandlers!.delete(handler as EventHandler<unknown>);
      if (topicHandlers!.size === 0) {
        this.handlers.delete(topic);
      }
    };
  }

  /**
   * Get the number of topics with subscribers (for testing).
   */
  get topicCount(): number {
    return this.handlers.size;
  }

  /**
   * Get the total number of handlers across all topics (for testing).
   */
  get handlerCount(): number {
    let count = 0;
    for (const handlers of this.handlers.values()) {
      count += handlers.size;
    }
    return count;
  }

  /**
   * Clear all subscriptions (for testing).
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * No-op event bus that does nothing.
 * Useful when event processing is not needed.
 */
export class NoOpEventBus implements IEventBus {
  async publish<T>(_topic: string, _event: T): Promise<void> {
    // No-op
  }

  subscribe<T>(_topic: string, _handler: EventHandler<T>): Unsubscribe {
    // Return no-op unsubscribe
    return () => {};
  }
}
