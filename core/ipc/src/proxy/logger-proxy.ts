/**
 * @module @kb-labs/core-ipc/proxy
 * IPC proxy for ILogger adapter.
 *
 * Forwards every log call to the parent process via IPC so that
 * `useLogger()` inside worker-pool plugin code lands in the host's
 * real logger (pino) with all correlation fields.
 *
 * Design notes:
 * - Fire-and-forget. ILogger methods are sync `void`; we dispatch the
 *   IPC call asynchronously and swallow errors. Logging must never
 *   throw or block the caller.
 * - `child(bindings)` is implemented locally — returns a new LoggerProxy
 *   carrying merged bound context. Each subsequent call merges that
 *   context into the call's `meta` argument, so the parent logger sees
 *   the same bindings it would for an in-process child.
 * - This used to be a NOOP by default ("too chatty for IPC"). In practice
 *   useLogger() is called rarely on hot paths (intentional, structured
 *   logs only — UI/shell streaming is a separate path via eventEmitter),
 *   so IPC overhead is acceptable in exchange for diagnostics that
 *   actually surface in host logs.
 */

import type { ILogger } from '@kb-labs/core-platform';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export class LoggerProxy extends RemoteAdapter<ILogger> implements ILogger {
  private readonly boundContext: Record<string, unknown>;
  private readonly proxyTransport: ITransport;

  constructor(transport: ITransport, boundContext: Record<string, unknown> = {}) {
    super('logger', transport);
    this.proxyTransport = transport;
    this.boundContext = boundContext;
  }

  private dispatch(level: LogLevel, args: unknown[]): void {
    const merged = this.mergeContextIntoArgs(args);
    // Fire-and-forget. callRemote awaits an empty void response from
    // the parent; we intentionally do not block the caller and swallow
    // transport errors (logging must not throw).
    void this.callRemote(level, merged).catch(() => {});
  }

  /**
   * Merge boundContext into the meta argument of a log call.
   *
   * Supported shapes (matches ILogger overloads used by Pino adapter):
   * - `[message, meta?]` — for info/warn/debug/trace/fatal
   * - `[message, error?, meta?]` — for error
   * - `[payloadObject]` — bag of fields including `message`
   */
  private mergeContextIntoArgs(args: unknown[]): unknown[] {
    if (Object.keys(this.boundContext).length === 0) {
      return args;
    }

    if (args.length === 0) {
      return [{ ...this.boundContext }];
    }

    const [first, ...rest] = args;
    const last = rest.length > 0 ? rest[rest.length - 1] : undefined;

    // Case: single payload object — merge into it.
    if (rest.length === 0 && isPlainObject(first)) {
      return [{ ...this.boundContext, ...first }];
    }

    // Case: last arg is a plain meta object — merge into it.
    if (isPlainObject(last)) {
      const merged = { ...this.boundContext, ...last };
      return [first, ...rest.slice(0, -1), merged];
    }

    // Case: no meta object present — append boundContext as meta.
    return [...args, { ...this.boundContext }];
  }

  trace(...args: unknown[]): void { this.dispatch('trace', args); }
  debug(...args: unknown[]): void { this.dispatch('debug', args); }
  info(...args: unknown[]): void { this.dispatch('info', args); }
  warn(...args: unknown[]): void { this.dispatch('warn', args); }
  error(...args: unknown[]): void { this.dispatch('error', args); }
  fatal(...args: unknown[]): void { this.dispatch('fatal', args); }

  child(bindings: Record<string, unknown>): ILogger {
    return new LoggerProxy(this.proxyTransport, { ...this.boundContext, ...bindings });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function createLoggerProxy(
  transport: ITransport,
  boundContext: Record<string, unknown> = {},
): LoggerProxy {
  return new LoggerProxy(transport, boundContext);
}
