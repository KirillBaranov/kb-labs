import type { ILogger, LogLevel } from "../adapters/logger.js";

/** Stable identity attached to every platform-owned log record. */
export interface PlatformLogContext {
  applicationId: string;
  serviceId: string;
  instanceId: string;
  layer: string;
}

/** Correlation supplied by the active operation, such as an HTTP request. */
export interface LogCorrelationContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
}

/** Identity inherited by code executed on behalf of a plugin. */
export interface PluginLogContext {
  pluginId: string;
  pluginVersion?: string;
  pluginKind?: string;
}

export interface LogDiagnostic {
  summary: string;
  causes?: Array<{ kind: string; evidence?: Record<string, unknown> }>;
  state?: { expected?: string; observed?: string };
  remediation?: Array<{
    action: string;
    target?: string;
    command?: string;
    verification?: string;
  }>;
  confidence: "high" | "medium" | "low";
}

export interface LogEvent {
  event: `${string}.${string}`;
  message?: string;
  fields?: Record<string, unknown>;
  error?: Error;
  diagnostic?: LogDiagnostic;
}

export type LogContext = PlatformLogContext &
  Partial<LogCorrelationContext & PluginLogContext> & {
    component?: string;
    operation?: string;
  };

/**
 * Context-aware logger for platform code.
 *
 * Identity and correlation fields are inherited parent-first: a child can add
 * context, but cannot replace a value already established by its parent.
 * Dynamic scopes (component and operation) are emitted as record metadata so
 * Pino never receives duplicate child bindings.
 */
export interface IContextLogger extends ILogger {
  readonly context: Readonly<LogContext>;
  with(context: Partial<LogContext> & Record<string, unknown>): IContextLogger;
  forComponent(component: string): IContextLogger;
  forOperation(
    operation: string,
    correlation?: LogCorrelationContext,
  ): IContextLogger;
  forPlugin(context: PluginLogContext): IContextLogger;
  event(level: LogLevel, event: LogEvent): void;
}

const INHERITED_FIELDS = new Set<keyof LogContext>([
  "applicationId",
  "serviceId",
  "instanceId",
  "layer",
  "requestId",
  "traceId",
  "spanId",
  "tenantId",
  "pluginId",
  "pluginVersion",
  "pluginKind",
]);

const CONTEXT_FIELDS = new Set<string>([
  ...INHERITED_FIELDS,
  "component",
  "operation",
]);

/** All keys reserved by the platform log contract. */
export const PLATFORM_LOG_FIELDS = new Set<string>(CONTEXT_FIELDS);

/** Agent diagnostics are intentionally opt-in because they are richer than human logs. */
export function isAgentDiagnosticsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.KB_DIAGNOSTICS === "agent";
}

function mergeContext(
  parent: LogContext,
  additions: Partial<LogContext> & Record<string, unknown>,
): LogContext {
  const next: Record<string, unknown> = { ...parent };

  for (const [key, value] of Object.entries(additions)) {
    if (value === undefined) continue;
    if (
      INHERITED_FIELDS.has(key as keyof LogContext) &&
      next[key] !== undefined
    ) {
      continue;
    }
    next[key] = value;
  }

  return next as unknown as LogContext;
}

function mergeRecord(
  context: LogContext,
  fields?: Record<string, unknown>,
): Record<string, unknown> {
  const record: Record<string, unknown> = { ...context };
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (
      INHERITED_FIELDS.has(key as keyof LogContext) &&
      record[key] !== undefined
    )
      continue;
    record[key] = value;
  }
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ContextLogger implements IContextLogger {
  public readonly context: Readonly<LogContext>;

  public constructor(
    private readonly base: ILogger,
    context: LogContext,
  ) {
    this.context = Object.freeze({ ...context });
  }

  public with(
    context: Partial<LogContext> & Record<string, unknown>,
  ): IContextLogger {
    return new ContextLogger(this.base, mergeContext(this.context, context));
  }

  public forComponent(component: string): IContextLogger {
    return this.with({ component });
  }

  public forOperation(
    operation: string,
    correlation: LogCorrelationContext = {},
  ): IContextLogger {
    return this.with({ operation, ...correlation });
  }

  public forPlugin(context: PluginLogContext): IContextLogger {
    return this.with({ ...context });
  }

  public event(level: LogLevel, event: LogEvent): void {
    const fields = {
      event: event.event,
      ...(event.fields ?? {}),
      ...(event.diagnostic && isAgentDiagnosticsEnabled()
        ? { diagnostic: event.diagnostic }
        : {}),
    };
    const message = event.message ?? event.event;
    this.write(level, message, fields, event.error);
  }

  public trace(message: string, meta?: Record<string, unknown>): void {
    const normalized = this.normalizeMessage(message, meta);
    this.base.trace(
      normalized.message,
      mergeRecord(this.context, normalized.meta),
    );
  }
  public debug(message: string, meta?: Record<string, unknown>): void {
    const normalized = this.normalizeMessage(message, meta);
    this.base.debug(
      normalized.message,
      mergeRecord(this.context, normalized.meta),
    );
  }
  public info(message: string, meta?: Record<string, unknown>): void {
    const normalized = this.normalizeMessage(message, meta);
    this.base.info(
      normalized.message,
      mergeRecord(this.context, normalized.meta),
    );
  }
  public warn(message: string, meta?: Record<string, unknown>): void {
    const normalized = this.normalizeMessage(message, meta);
    this.base.warn(
      normalized.message,
      mergeRecord(this.context, normalized.meta),
    );
  }
  public error(
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void {
    const normalized = this.normalizeError(message, error, meta);
    this.base.error(
      normalized.message,
      normalized.error,
      mergeRecord(this.context, normalized.meta),
    );
  }
  public fatal(
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void {
    const normalized = this.normalizeError(message, error, meta);
    this.base.fatal(
      normalized.message,
      normalized.error,
      mergeRecord(this.context, normalized.meta),
    );
  }

  public child(bindings: Record<string, unknown>): IContextLogger {
    return this.with(bindings);
  }

  public getLogBuffer() {
    return this.base.getLogBuffer?.();
  }

  public onLog(callback: Parameters<NonNullable<ILogger["onLog"]>>[0]) {
    return this.base.onLog?.(callback) ?? (() => {});
  }

  /**
   * Preserve Pino's `(fields, message)` convention at the adapter boundary.
   * ILogger's public contract remains `(message, fields)`, but Fastify and
   * third-party plugins may invoke the logger with Pino's runtime convention.
   */
  private normalizeMessage(
    message: unknown,
    meta: unknown,
  ): { message: string; meta?: Record<string, unknown> } {
    if (typeof message === "string") {
      return { message, meta: isRecord(meta) ? meta : undefined };
    }
    return {
      message: typeof meta === "string" ? meta : "Log event",
      meta: isRecord(message) ? message : undefined,
    };
  }

  private normalizeError(
    message: unknown,
    error: unknown,
    meta: unknown,
  ): { message: string; error?: Error; meta?: Record<string, unknown> } {
    if (typeof message === "string") {
      return {
        message,
        error: error instanceof Error ? error : undefined,
        meta: isRecord(meta) ? meta : undefined,
      };
    }
    const errorValue =
      message instanceof Error
        ? message
        : error instanceof Error
          ? error
          : undefined;
    return {
      message:
        typeof error === "string"
          ? error
          : (errorValue?.message ?? "Log event"),
      error: errorValue,
      meta: isRecord(message) ? message : isRecord(meta) ? meta : undefined,
    };
  }

  private write(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown>,
    error?: Error,
  ): void {
    switch (level) {
      case "trace":
        return this.trace(message, fields);
      case "debug":
        return this.debug(message, fields);
      case "info":
        return this.info(message, fields);
      case "warn":
        return this.warn(message, fields);
      case "error":
        return this.error(message, error, fields);
      case "fatal":
        return this.fatal(message, error, fields);
    }
  }
}

/** Create the root logger for one platform application. */
export function createContextLogger(
  base: ILogger,
  context: PlatformLogContext,
): IContextLogger {
  return new ContextLogger(base, context);
}
