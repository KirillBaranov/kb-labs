import { WebSocket, type RawData } from 'ws';

/**
 * Test-friendly WebSocket wrapper.
 *
 * Adapted from `infra/kb-labs-gateway/apps/gateway-app/src/__tests__/live-gateway.e2e.test.ts`
 * — same tracking semantics so the harness can clean up leaked sockets
 * between tests even when an assertion fails mid-flight.
 */

export interface WsOptions {
  headers?: Record<string, string>;
  /** ms. Default 8000. */
  openTimeoutMs?: number;
}

/** Opaque handle returned from `connectWs`. */
export interface WsHandle {
  readonly socket: WebSocket;
  /** Send a JSON-stringified message. */
  send(data: unknown): void;
  /** Wait for the next message, optionally satisfying a predicate. */
  waitForMessage<T = unknown>(
    opts?: { timeoutMs?: number; predicate?: (msg: T) => boolean },
  ): Promise<T>;
  /** Collect the next N messages (parsed as JSON). */
  collect<T = unknown>(count: number, timeoutMs?: number): Promise<T[]>;
  close(code?: number): void;
}

/**
 * Shared registry of open sockets. Call `closeAllTrackedSockets()` from an
 * `afterEach` to guarantee cleanup.
 */
const openSockets = new Set<WebSocket>();

export async function closeAllTrackedSockets(graceMs = 150): Promise<void> {
  const toClose = [...openSockets];
  for (const ws of toClose) {
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      try {
        ws.close(1000);
      } catch {
        // intentionally empty: best-effort cleanup, socket may already be dead
      }
    }
  }
  openSockets.clear();
  if (toClose.length > 0) {
    await new Promise((r) => { setTimeout(r, graceMs); });
  }
}

export function connectWs(url: string, opts: WsOptions = {}): Promise<WsHandle> {
  const openTimeoutMs = opts.openTimeoutMs ?? 8000;
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(url, {
      headers: opts.headers,
    });
    openSockets.add(ws);
    ws.on('close', () => openSockets.delete(ws));

    const timer = setTimeout(() => {
      reject(new Error(`WebSocket open timeout after ${openTimeoutMs}ms: ${url}`));
      try { ws.close(); } catch {
        // intentionally empty: best-effort cleanup on timeout
      }
    }, openTimeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolvePromise(wrapHandle(ws));
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function wrapHandle(ws: WebSocket): WsHandle {
  return {
    socket: ws,
    send(data: unknown) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    },
    waitForMessage<T = unknown>(
      opts: { timeoutMs?: number; predicate?: (msg: T) => boolean } = {},
    ): Promise<T> {
      const timeoutMs = opts.timeoutMs ?? 5000;
      return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', onMessage);
          reject(new Error(`WebSocket message timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        const onMessage = (raw: RawData) => {
          let msg: T;
          try {
            msg = JSON.parse(raw.toString()) as T;
          } catch (err) {
            clearTimeout(timer);
            ws.off('message', onMessage);
            reject(new Error(`Non-JSON WebSocket message: ${(err as Error).message}`));
            return;
          }
          if (!opts.predicate || opts.predicate(msg)) {
            clearTimeout(timer);
            ws.off('message', onMessage);
            resolvePromise(msg);
          }
        };
        ws.on('message', onMessage);
      });
    },
    collect<T = unknown>(count: number, timeoutMs = 5000): Promise<T[]> {
      return new Promise((resolvePromise, reject) => {
        const msgs: T[] = [];
        const timer = setTimeout(() => {
          ws.off('message', onMessage);
          reject(
            new Error(
              `Timeout: expected ${count} WS messages, got ${msgs.length}: ${JSON.stringify(msgs)}`,
            ),
          );
        }, timeoutMs);
        const onMessage = (raw: RawData) => {
          msgs.push(JSON.parse(raw.toString()) as T);
          if (msgs.length >= count) {
            clearTimeout(timer);
            ws.off('message', onMessage);
            resolvePromise(msgs);
          }
        };
        ws.on('message', onMessage);
      });
    },
    close(code = 1000) {
      try {
        ws.close(code);
      } catch {
        // intentionally empty: best-effort cleanup
      }
    },
  };
}
