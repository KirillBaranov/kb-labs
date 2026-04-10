/**
 * TraceContext implementation
 */

import type { TraceContext, TraceEvent, Logger } from '@kb-labs/plugin-contracts';

export interface CreateTraceContextOptions {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  logger: Logger;
}

/**
 * Create a TraceContext implementation
 */
export function createTraceContext(options: CreateTraceContextOptions): TraceContext {
  const { traceId, spanId, parentSpanId, logger } = options;
  const attributes: Record<string, string | number | boolean> = {};
  const events: TraceEvent[] = [];

  return {
    traceId,
    spanId,
    parentSpanId,

    addEvent(name: string, eventAttributes?: Record<string, unknown>): void {
      const event: TraceEvent = {
        name,
        timestamp: Date.now(),
        attributes: eventAttributes,
      };
      events.push(event);

      // Log the event
      logger.debug(`[trace] ${name}`, {
        traceId,
        spanId,
        ...eventAttributes,
      });
    },

    setAttribute(key: string, value: string | number | boolean): void {
      attributes[key] = value;
    },

    recordError(error: Error): void {
      this.addEvent('exception', {
        'exception.type': error.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack,
      });
    },
  };
}
