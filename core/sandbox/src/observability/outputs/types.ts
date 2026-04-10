/**
 * @module @kb-labs/core-sandbox/observability/outputs/types
 * Event sink interfaces for pluggable outputs
 */

import type { ObservabilityEvent } from '../events/schema';

/**
 * EventSink - pluggable output interface
 *
 * Implementations can:
 * - Write to files (FileLogger)
 * - Store in database (SQLiteStorage)
 * - Stream to UI (WebSocketStreamer)
 * - Send to AI (AIAnalyzer)
 * - Forward to external services (SentryIntegration, DatadogIntegration)
 *
 * Each sink is independent and failures are isolated
 */
export interface EventSink {
  /**
   * Write single event
   *
   * MUST NOT throw - handle errors internally
   * SHOULD be async but non-blocking
   */
  write(event: ObservabilityEvent): void | Promise<void>;

  /**
   * Flush buffered events (if applicable)
   */
  flush?(): Promise<void>;

  /**
   * Close/cleanup resources
   */
  close?(): Promise<void>;
}

/**
 * EventSink with filtering capability
 */
export interface FilterableEventSink extends EventSink {
  /**
   * Should this event be written?
   */
  shouldWrite(event: ObservabilityEvent): boolean;
}

/**
 * EventSink options
 */
export interface EventSinkOptions {
  /** Human-readable name */
  name: string;

  /** Enable/disable this sink */
  enabled?: boolean;

  /** Filter function */
  filter?: (event: ObservabilityEvent) => boolean;
}
