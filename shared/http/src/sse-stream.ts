import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ILogger } from "@kb-labs/core-platform";
import { createRealtimeLogger } from "./realtime-log-context.js";

export interface SseStreamOptions {
  logger: ILogger;
  serviceId: string;
  requestId?: string;
  traceId?: string;
  route?: string;
  connectionId?: string;
  keepAliveMs?: number;
  /** Message-level logs are off by default to avoid log amplification. */
  logEvents?: boolean;
  headers?: Record<string, string>;
}

export interface SseStream {
  readonly connectionId: string;
  readonly closed: Promise<void>;
  send(event: string, data: unknown, id?: string): boolean;
  comment(comment: string): boolean;
  onCleanup(cleanup: () => void): void;
  /** Called when the underlying HTTP response reports a transport error. */
  onError(listener: (error: Error) => void): void;
  close(reason?: string): void;
}

/**
 * Owns a server-side SSE connection: headers, lifecycle, cleanup and summary
 * logging. Callers only publish domain events and register subscriptions for
 * cleanup; they never touch `reply.raw` directly.
 */
export function createSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  options: SseStreamOptions,
): SseStream {
  const connectionId = options.connectionId ?? randomUUID();
  const requestId = options.requestId ?? request.id;
  const traceId = options.traceId ?? header(request, "x-trace-id");
  const logger = createRealtimeLogger(options.logger, {
    serviceId: options.serviceId,
    transport: "sse",
    connectionId,
    requestId,
    traceId,
    route: options.route ?? request.routeOptions?.url ?? request.url,
  });
  const startedAt = Date.now();
  const cleanups = new Set<() => void>();
  const errorListeners = new Set<(error: Error) => void>();
  let eventsSent = 0;
  let bytesSent = 0;
  let closed = false;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  reply.hijack();
  const raw = reply.raw;
  raw.setHeader("Content-Type", "text/event-stream");
  raw.setHeader("Cache-Control", "no-cache, no-transform");
  raw.setHeader("Connection", "keep-alive");
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    raw.setHeader(name, value);
  }
  raw.flushHeaders?.();

  const close = (reason = "closed") => {
    if (closed) {
      return;
    }
    closed = true;
    if (keepAlive) {
      clearInterval(keepAlive);
    }
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        /* cleanup must never destabilise a transport */
      }
    }
    cleanups.clear();
    logger.info("SSE connection closed", {
      event: "sse.connection.closed",
      reason,
      durationMs: Date.now() - startedAt,
      eventsSent,
      bytesSent,
    });
    if (!raw.writableEnded && !raw.destroyed) {
      raw.end();
    }
    resolveClosed();
  };

  const notifyError = (error: Error) => {
    for (const listener of errorListeners) {
      try {
        listener(error);
      } catch {
        /* transport error observers are isolated */
      }
    }
  };

  const write = (payload: string): boolean => {
    if (closed || raw.writableEnded || raw.destroyed) {
      return false;
    }
    try {
      const accepted = raw.write(payload);
      bytesSent += Buffer.byteLength(payload);
      if (!accepted) {
        logger.warn("SSE write backpressure", {
          event: "sse.write.backpressure",
        });
      }
      return accepted;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      logger.error("SSE write failed", normalizedError, {
        event: "sse.connection.failed",
      });
      notifyError(normalizedError);
      close("write_error");
      return false;
    }
  };

  const keepAlive =
    options.keepAliveMs && options.keepAliveMs > 0
      ? setInterval(() => {
          write(": keep-alive\n\n");
        }, options.keepAliveMs)
      : undefined;

  raw.on("close", () => close("client_closed"));
  raw.on("error", (error: Error) => {
    notifyError(error);
    close("transport_error");
  });
  logger.info("SSE connection opened", { event: "sse.connection.opened" });
  write(": connected\n\n");

  return {
    connectionId,
    closed: closedPromise,
    send(event, data, id) {
      const payload = `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      const accepted = write(payload);
      if (accepted) {
        eventsSent += 1;
        if (options.logEvents) {
          logger.debug("SSE event sent", {
            event: "sse.event.sent",
            "sse.event_type": event,
          });
        }
      }
      return accepted;
    },
    comment(comment) {
      return write(`: ${comment}\n\n`);
    },
    onCleanup(cleanup) {
      cleanups.add(cleanup);
    },
    onError(listener) {
      errorListeners.add(listener);
    },
    close,
  };
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
