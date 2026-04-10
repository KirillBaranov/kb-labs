/**
 * @module @kb-labs/core-sandbox/observability/tracing/types
 * Chrome Tracing format types
 *
 * Spec: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
 */

/**
 * Chrome Tracing event phase
 */
export type TraceEventPhase =
  | 'B'  // Begin
  | 'E'  // End
  | 'X'  // Complete (duration event)
  | 'i'  // Instant
  | 'C'  // Counter
  | 'b'  // Async begin
  | 'e'  // Async end
  | 'n'  // Async instant
  | 's'  // Flow start
  | 't'  // Flow step
  | 'f'; // Flow end

/**
 * Chrome Tracing event
 */
export interface ChromeTraceEvent {
  /** Event name */
  name: string;

  /** Category */
  cat?: string;

  /** Phase */
  ph: TraceEventPhase;

  /** Timestamp (microseconds) */
  ts: number;

  /** Duration (microseconds, for 'X' events) */
  dur?: number;

  /** Process ID */
  pid: number;

  /** Thread ID */
  tid: number | string;

  /** Event arguments */
  args?: Record<string, any>;

  /** Scope (for instant events) */
  s?: 'g' | 'p' | 't'; // global, process, thread
}

/**
 * Chrome Tracing format
 */
export interface ChromeTraceFormat {
  /** Trace events */
  traceEvents: ChromeTraceEvent[];

  /** Display time unit */
  displayTimeUnit?: 'ms' | 'ns';

  /** System trace data */
  systemTraceEvents?: string;

  /** Other data */
  otherData?: Record<string, any>;

  /** Metadata */
  metadata?: {
    'clock-domain'?: string;
    'highres-ticks'?: boolean;
    'network-type'?: string;
    'num-cpus'?: number;
    'os-name'?: string;
    'physical-memory'?: number;
    'power-profile'?: string;
    'product'?: string;
    'user-agent'?: string;
    [key: string]: any;
  };
}
