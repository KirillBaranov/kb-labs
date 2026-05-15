import { connectWs } from '../ws-client.js';
import type { WsHandle, WsOptions } from '../ws-client.js';

export type { WsHandle, WsOptions };

/**
 * Opens a WebSocket, runs `fn`, then closes the socket.
 * The socket is always closed in a finally block — even if `fn` throws.
 */
export async function withWs<T>(
  url: string,
  fn: (ws: WsHandle) => Promise<T>,
  opts?: WsOptions,
): Promise<T> {
  const ws = await connectWs(url, opts);
  try {
    return await fn(ws);
  } finally {
    try {
      ws.close(1000);
    } catch {
      // intentionally empty: best-effort cleanup
    }
  }
}
