/**
 * @module @kb-labs/core-sandbox/observability/events/collector
 * Central event collection hub
 *
 * All events flow through EventCollector to registered sinks
 */

import type { ObservabilityEvent, ExecutionContext } from './schema';
import type { EventSink } from '../outputs/types';

/**
 * EventCollector - central hub for all observability events
 *
 * Responsibilities:
 * - Collect events from all sources
 * - Route to registered sinks (file, console, AI, etc.)
 * - Handle sink failures gracefully
 * - Provide query/filter API
 */
export class EventCollector {
  private sinks: Set<EventSink> = new Set();
  private defaultContext: Partial<ExecutionContext> | null = null;

  constructor() {
    // Setup default context from process
    this.defaultContext = {
      pid: process.pid,
      pluginId: process.env.KB_PLUGIN_ID || 'unknown',
      pluginVersion: process.env.KB_PLUGIN_VERSION || '0.0.0',
    };
  }

  /**
   * Register event sink
   */
  addSink(sink: EventSink): void {
    this.sinks.add(sink);
  }

  /**
   * Unregister event sink
   */
  removeSink(sink: EventSink): void {
    this.sinks.delete(sink);
  }

  /**
   * Emit event to all sinks
   */
  emit(event: ObservabilityEvent): void {
    // Merge default context
    if (this.defaultContext) {
      event.context = {
        ...this.defaultContext,
        ...event.context,
      } as ExecutionContext;
    }

    // Write to all sinks (isolated failures)
    for (const sink of this.sinks) {
      try {
        const result = sink.write(event);

        // Handle async sinks
        if (result instanceof Promise) {
          result.catch(err => {
            process.stderr.write(`[EventCollector] Sink error: ${err}\n`);
          });
        }
      } catch (err) {
        // Never let sink failure stop event collection
        process.stderr.write(`[EventCollector] Sink error: ${err}\n`);
      }
    }
  }

  /**
   * Flush all sinks
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sink of this.sinks) {
      if (sink.flush) {
        promises.push(
          sink.flush().catch(err => {
            process.stderr.write(`[EventCollector] Flush error: ${err}\n`);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Close all sinks
   */
  async close(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sink of this.sinks) {
      if (sink.close) {
        promises.push(
          sink.close().catch(err => {
            process.stderr.write(`[EventCollector] Close error: ${err}\n`);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Set default context for all events
   */
  setDefaultContext(context: Partial<ExecutionContext>): void {
    this.defaultContext = {
      ...this.defaultContext,
      ...context,
    };
  }
}

/**
 * Global singleton collector
 */
let globalCollector: EventCollector | null = null;

/**
 * Get or create global collector
 */
export function getGlobalCollector(): EventCollector {
  if (!globalCollector) {
    globalCollector = new EventCollector();
  }
  return globalCollector;
}

/**
 * Reset global collector (for testing)
 */
export function resetGlobalCollector(): void {
  if (globalCollector) {
    globalCollector.close().catch(() => {});
    globalCollector = null;
  }
}
