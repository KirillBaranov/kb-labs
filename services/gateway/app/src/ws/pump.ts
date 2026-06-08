/**
 * @module gateway-app/ws/pump
 *
 * Bidirectional frame relay between a downstream client WebSocket and an
 * upstream WebSocket (opened over a Unix domain socket via the `ws+unix://`
 * scheme). Used by the gateway's WS dialer to proxy WebSocket traffic to
 * socket-bound services, which @fastify/http-proxy cannot do.
 *
 * Guarantees:
 *  - client frames sent before the upstream is OPEN are buffered, then flushed
 *    in order on 'open' (no lost frames);
 *  - binary/text framing is preserved in both directions;
 *  - close (code/reason) and error propagate to the other side exactly once.
 */
import type { RawData, WebSocket } from 'ws';
import type { ILogger } from '@kb-labs/core-platform';

const OPEN = 1; // WebSocket.OPEN

/**
 * Close codes that must NOT be echoed back via close(code): 1005 (no status)
 * and 1006 (abnormal) are reserved and throw if passed to close().
 */
function normalizeCloseCode(code: number | undefined): number | undefined {
  if (code === undefined || code === 1005 || code === 1006) {
    return undefined;
  }
  return code;
}

function safeClose(ws: WebSocket, code?: number, reason?: Buffer | string): void {
  if (ws.readyState === OPEN || ws.readyState === 0 /* CONNECTING */) {
    try {
      if (code === undefined) {
        ws.close();
      } else if (reason === undefined) {
        ws.close(code);
      } else {
        ws.close(code, reason);
      }
    } catch {
      /* already closing/closed — ignore */
    }
  }
}

export function pumpBidirectional(client: WebSocket, upstream: WebSocket, logger: ILogger): void {
  const pending: Array<{ data: RawData; binary: boolean }> = [];
  let upstreamOpen = false;
  let closed = false;

  const closeBoth = (code?: number, reason?: Buffer | string): void => {
    if (closed) {
      return;
    }
    closed = true;
    safeClose(client, code, reason);
    safeClose(upstream, code, reason);
  };

  // client → upstream (buffer until upstream is OPEN)
  client.on('message', (data: RawData, isBinary: boolean) => {
    if (upstreamOpen && upstream.readyState === OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pending.push({ data, binary: isBinary });
    }
  });

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const frame of pending) {
      if (upstream.readyState === OPEN) {
        upstream.send(frame.data, { binary: frame.binary });
      }
    }
    pending.length = 0;
  });

  // upstream → client
  upstream.on('message', (data: RawData, isBinary: boolean) => {
    if (client.readyState === OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on('close', (code: number, reason: Buffer) => {
    closeBoth(normalizeCloseCode(code), reason);
  });
  client.on('close', (code: number, reason: Buffer) => {
    closeBoth(normalizeCloseCode(code), reason);
  });

  upstream.on('error', (err: Error) => {
    logger.warn('Upstream WS error', { error: err.message });
    closeBoth(1011);
  });
  client.on('error', () => {
    closeBoth(1011);
  });
}
