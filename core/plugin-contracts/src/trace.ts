/**
 * Trace Context for V3 Plugin System
 *
 * Provides distributed tracing capabilities for debugging and observability.
 * Trace IDs propagate across plugin invocations.
 */

/**
 * Trace context for distributed tracing
 */
export interface TraceContext {
  /**
   * Trace ID (propagated across invocations)
   * Same across all spans in a single logical operation
   */
  readonly traceId: string;

  /**
   * Span ID (unique per request)
   * Different for each plugin execution within a trace
   */
  readonly spanId: string;

  /**
   * Parent span ID (if invoked from another plugin)
   */
  readonly parentSpanId?: string;

  /**
   * Add an event to the current span
   *
   * Events are timestamped occurrences within a span.
   *
   * @param name Event name (e.g., "cache.hit", "llm.call")
   * @param attributes Optional key-value attributes
   */
  addEvent(name: string, attributes?: Record<string, unknown>): void;

  /**
   * Set an attribute on the current span
   *
   * @param key Attribute key
   * @param value Attribute value (must be serializable)
   */
  setAttribute(key: string, value: string | number | boolean): void;

  /**
   * Record an error on the current span
   *
   * @param error Error to record
   */
  recordError(error: Error): void;
}

/**
 * Trace span status
 */
export type TraceSpanStatus = 'ok' | 'error' | 'unset';

/**
 * Span data for export/serialization
 */
export interface TraceSpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  status: TraceSpanStatus;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  events: TraceEvent[];
}

/**
 * Trace event
 */
export interface TraceEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

/**
 * No-op trace context (for when tracing is disabled)
 */
export const noopTraceContext: TraceContext = {
  traceId: 'noop',
  spanId: 'noop',
  addEvent: () => {},
  setAttribute: () => {},
  recordError: () => {},
};
