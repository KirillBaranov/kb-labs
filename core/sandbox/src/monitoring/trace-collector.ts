/**
 * @module @kb-labs/core-sandbox/monitoring/trace-collector
 * Distributed tracing support
 */

import type { TraceSpan } from '../types/index';

/**
 * Create a trace span
 * @param params - Span parameters
 * @returns Trace span
 */
export function createTraceSpan(params: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  attributes?: Record<string, unknown>;
}): TraceSpan {
  return {
    traceId: params.traceId,
    spanId: params.spanId,
    parentSpanId: params.parentSpanId,
    name: params.name,
    startTime: params.startTime,
    endTime: params.endTime,
    attributes: params.attributes,
  };
}

