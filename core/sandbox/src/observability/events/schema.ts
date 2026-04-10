/**
 * @module @kb-labs/core-sandbox/observability/events/schema
 * Unified event schema for all observability data
 *
 * This schema is designed to be:
 * - AI-ready: structured format, relationships, hints
 * - Extensible: flexible payload, forward-compatible
 * - Queryable: indexed fields, correlatable via IDs
 */

/**
 * Event type taxonomy
 */
export type EventType =
  | 'log'          // General log message
  | 'metric'       // Time-series metric
  | 'trace'        // Distributed trace span
  | 'error'        // Error/exception
  | 'memory'       // Memory allocation/snapshot
  | 'profile';     // CPU profile sample

/**
 * Severity levels (1-10 scale for AI prioritization)
 */
export type EventSeverity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Execution context - correlates events across operations
 */
export interface ExecutionContext {
  /** Plugin ID (e.g., '@kb-labs/mind') */
  pluginId: string;

  /** Plugin version */
  pluginVersion: string;

  /** Unique operation ID (UUID) - links related events */
  operationId: string;

  /** Parent operation ID (if this is a sub-operation) */
  parentOperationId?: string;

  /** Session ID (user session) */
  sessionId?: string;

  /** User ID (if authenticated) */
  userId?: string;

  /** Process ID */
  pid: number;

  /** Thread/worker ID (if applicable) */
  threadId?: string;
}

/**
 * Event relationships - builds event graph for analysis
 */
export interface EventRelationships {
  /** Event IDs that caused this event */
  causedBy?: string[];

  /** Event IDs that this event triggered */
  triggers?: string[];

  /** Related/correlated event IDs */
  relatedTo?: string[];
}

/**
 * AI hints - metadata for machine learning analysis
 *
 * These fields are optional now but provide extension points
 * for future AI-powered analysis without schema changes
 */
export interface AIHints {
  /** Severity score (1-10) for AI prioritization */
  severity?: EventSeverity;

  /** Category for pattern matching */
  category?: string; // 'memory-leak' | 'slow-operation' | 'error-spike' | ...

  /** Is this event anomalous? */
  anomaly?: boolean;

  /** Known pattern ID (if matches known issue) */
  pattern?: string;

  /** Confidence score (0-1) for automated detection */
  confidence?: number;

  /** Feature vector for ML (future use) */
  features?: Record<string, number>;
}

/**
 * Memory snapshot data
 */
export interface MemorySnapshot {
  /** Heap used (bytes) */
  heapUsed: number;

  /** Heap total (bytes) */
  heapTotal: number;

  /** RSS (bytes) */
  rss: number;

  /** External memory (bytes) */
  external: number;

  /** Array buffers (bytes) */
  arrayBuffers?: number;
}

/**
 * Unified Observability Event
 *
 * All events (logs, metrics, traces, errors) use this schema
 */
export interface ObservabilityEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Unix timestamp (milliseconds) */
  timestamp: number;

  /** Event type */
  type: EventType;

  /** Execution context */
  context: ExecutionContext;

  /** Event payload (type-specific data) */
  payload: Record<string, any>;

  /** Event relationships */
  relationships?: EventRelationships;

  /** AI hints (optional, for future ML) */
  aiHints?: AIHints;

  /** Tags for categorization/filtering */
  tags?: string[];
}

/**
 * Log-specific event payload
 */
export interface LogEventPayload {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  code?: string;
  stack?: string[];
  metadata?: Record<string, any>;
}

/**
 * Metric-specific event payload
 */
export interface MetricEventPayload {
  metric: string;      // 'memory.heap.used' | 'cpu.usage' | ...
  value: number;
  unit: string;        // 'bytes' | 'percent' | 'ms' | ...
  dimensions?: Record<string, string>;
}

/**
 * Trace-specific event payload
 */
export interface TraceEventPayload {
  name: string;        // Operation name
  phase: 'B' | 'E' | 'X' | 'i';  // Begin, End, Complete, Instant
  duration?: number;   // ms
  args?: Record<string, any>;
}

/**
 * Error-specific event payload
 */
export interface ErrorEventPayload {
  message: string;
  code?: string;
  name: string;
  stack: string[];
  cause?: string;
  severity: EventSeverity;
}

/**
 * Memory-specific event payload
 */
export interface MemoryEventPayload {
  snapshot: MemorySnapshot;
  delta?: Partial<MemorySnapshot>;  // Change since last snapshot
  allocations?: Array<{
    type: string;
    size: number;
    stack: string[];
  }>;
}

/**
 * Helper functions for creating typed events
 */
export function createLogEvent(
  context: ExecutionContext,
  payload: LogEventPayload,
  options?: { tags?: string[]; aiHints?: AIHints }
): ObservabilityEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'log',
    context,
    payload,
    tags: options?.tags,
    aiHints: options?.aiHints,
  };
}

export function createMetricEvent(
  context: ExecutionContext,
  payload: MetricEventPayload,
  options?: { tags?: string[]; aiHints?: AIHints }
): ObservabilityEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'metric',
    context,
    payload,
    tags: options?.tags,
    aiHints: options?.aiHints,
  };
}

export function createTraceEvent(
  context: ExecutionContext,
  payload: TraceEventPayload,
  options?: { tags?: string[]; relationships?: EventRelationships; aiHints?: AIHints }
): ObservabilityEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'trace',
    context,
    payload,
    relationships: options?.relationships,
    tags: options?.tags,
    aiHints: options?.aiHints,
  };
}

export function createErrorEvent(
  context: ExecutionContext,
  payload: ErrorEventPayload,
  options?: { tags?: string[]; relationships?: EventRelationships; aiHints?: AIHints }
): ObservabilityEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'error',
    context,
    payload,
    relationships: options?.relationships,
    tags: options?.tags,
    aiHints: {
      ...options?.aiHints,
      severity: payload.severity,
      category: 'error',
    },
  };
}

export function createMemoryEvent(
  context: ExecutionContext,
  payload: MemoryEventPayload,
  options?: { tags?: string[]; aiHints?: AIHints }
): ObservabilityEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'memory',
    context,
    payload,
    tags: options?.tags,
    aiHints: options?.aiHints,
  };
}
