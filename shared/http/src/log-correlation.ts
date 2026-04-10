import { hostname } from 'node:os';
import type { ServiceLogCorrelationContext } from '@kb-labs/core-contracts';
import type { ILogBuffer, LogRecord } from '@kb-labs/core-platform';
import { normalizeObservabilityRoute } from './http-observability-collector.js';

type CorrelationLogger = {
  trace(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): CorrelationLogger;
  getLogBuffer?: () => ILogBuffer | undefined;
  onLog?: (callback: (record: LogRecord) => void) => () => void;
};

export interface ServiceLogBindingInput extends Omit<ServiceLogCorrelationContext, 'instanceId' | 'logsSource'> {
  instanceId?: string;
  logsSource?: string;
  layer?: string;
  service?: string;
  bindings?: Record<string, unknown>;
}

export function resolveObservabilityInstanceId(): string {
  return `${hostname()}:${process.pid}`;
}

export function createServiceLogBindings(input: ServiceLogBindingInput): Record<string, unknown> {
  const route = input.route
    ? normalizeObservabilityRoute(input.route)
    : input.method && input.url
      ? `${input.method.toUpperCase()} ${normalizeObservabilityRoute(input.url)}`
      : undefined;

  return {
    serviceId: input.serviceId,
    instanceId: input.instanceId ?? resolveObservabilityInstanceId(),
    logsSource: input.logsSource ?? input.serviceId,
    ...(input.layer ? { layer: input.layer } : {}),
    ...(input.service ? { service: input.service } : {}),
    ...(input.requestId ? { requestId: input.requestId, reqId: input.requestId } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(route ? { route } : {}),
    ...(input.method ? { method: input.method.toUpperCase() } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.bindings ?? {}),
  };
}

export function createCorrelatedLogger(
  baseLogger: CorrelationLogger,
  input: ServiceLogBindingInput
): CorrelationLogger {
  const baseMeta = createServiceLogBindings(input);

  return {
    trace(message: string, meta?: Record<string, unknown>) {
      baseLogger.trace(message, { ...baseMeta, ...(meta ?? {}) });
    },
    debug(message: string, meta?: Record<string, unknown>) {
      baseLogger.debug(message, { ...baseMeta, ...(meta ?? {}) });
    },
    info(message: string, meta?: Record<string, unknown>) {
      baseLogger.info(message, { ...baseMeta, ...(meta ?? {}) });
    },
    warn(message: string, meta?: Record<string, unknown>) {
      baseLogger.warn(message, { ...baseMeta, ...(meta ?? {}) });
    },
    error(message: string, error?: Error, meta?: Record<string, unknown>) {
      baseLogger.error(message, error, { ...baseMeta, ...(meta ?? {}) });
    },
    fatal(message: string, error?: Error, meta?: Record<string, unknown>) {
      baseLogger.fatal(message, error, { ...baseMeta, ...(meta ?? {}) });
    },
    child(bindings: Record<string, unknown>) {
      return createCorrelatedLogger(baseLogger, {
        ...input,
        bindings: {
          ...(input.bindings ?? {}),
          ...bindings,
        },
      });
    },
    ...(baseLogger.getLogBuffer ? { getLogBuffer: baseLogger.getLogBuffer.bind(baseLogger) } : {}),
    ...(baseLogger.onLog ? { onLog: baseLogger.onLog.bind(baseLogger) } : {}),
  };
}
