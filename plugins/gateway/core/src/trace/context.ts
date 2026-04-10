import { randomUUID } from 'node:crypto';
import type { TraceContext } from '@kb-labs/gateway-contracts';

/** Create a root trace context (no parent) */
export function createRootTrace(traceId?: string): TraceContext {
  return {
    traceId: traceId ?? randomUUID(),
    spanId: randomUUID(),
  };
}

/** Create a child span from an existing trace context */
export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: randomUUID(),
    parentId: parent.spanId,
  };
}

/** Serialize TraceContext into HTTP headers */
export function traceToHeaders(trace: TraceContext): Record<string, string> {
  return {
    'x-trace-id': trace.traceId,
    'x-span-id': trace.spanId,
    ...(trace.parentId ? { 'x-parent-id': trace.parentId } : {}),
  };
}

/** Parse TraceContext from HTTP headers (returns null if missing) */
export function traceFromHeaders(headers: Record<string, string | string[] | undefined>): TraceContext | null {
  const traceId = asString(headers['x-trace-id']);
  const spanId = asString(headers['x-span-id']);
  if (!traceId || !spanId) {return null;}
  return {
    traceId,
    spanId,
    parentId: asString(headers['x-parent-id']),
  };
}

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) {return v[0];}
  return v;
}
