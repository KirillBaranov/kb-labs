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
  const startedAt = Date.now();
  let clientToUpstreamMessages = 0;
  let upstreamToClientMessages = 0;
  let clientToUpstreamBytes = 0;
  let upstreamToClientBytes = 0;
  let droppedMessages = 0;

  const byteLength = (data: RawData): number => {
    if (typeof data === 'string') { return Buffer.byteLength(data); }
    if (Buffer.isBuffer(data)) { return data.byteLength; }
    if (data instanceof ArrayBuffer) { return data.byteLength; }
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  };

  const closeBoth = (code?: number, reason?: Buffer | string, closeReason = 'peer_closed'): void => {
    if (closed) {
      return;
    }
    closed = true;
    safeClose(client, code, reason);
    safeClose(upstream, code, reason);
    logger.info('Gateway WebSocket relay closed', {
      event: 'websocket.relay.closed',
      closeReason,
      closeCode: code,
      durationMs: Date.now() - startedAt,
      clientToUpstreamMessages,
      upstreamToClientMessages,
      clientToUpstreamBytes,
      upstreamToClientBytes,
      droppedMessages,
    });
  };

  // client → upstream (buffer until upstream is OPEN)
  client.on('message', (data: RawData, isBinary: boolean) => {
    if (upstreamOpen && upstream.readyState === OPEN) {
      upstream.send(data, { binary: isBinary });
      clientToUpstreamMessages += 1;
      clientToUpstreamBytes += byteLength(data);
    } else {
      pending.push({ data, binary: isBinary });
    }
  });

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const frame of pending) {
      if (upstream.readyState === OPEN) {
        upstream.send(frame.data, { binary: frame.binary });
        clientToUpstreamMessages += 1;
        clientToUpstreamBytes += byteLength(frame.data);
      } else {
        droppedMessages += 1;
      }
    }
    pending.length = 0;
  });

  // upstream → client
  upstream.on('message', (data: RawData, isBinary: boolean) => {
    if (client.readyState === OPEN) {
      client.send(data, { binary: isBinary });
      upstreamToClientMessages += 1;
      upstreamToClientBytes += byteLength(data);
    } else {
      droppedMessages += 1;
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
    closeBoth(1011, undefined, 'upstream_error');
  });
  client.on('error', (err: Error) => {
    logger.warn('Client WS error', { error: err.message });
    closeBoth(1011, undefined, 'client_error');
  });
}
