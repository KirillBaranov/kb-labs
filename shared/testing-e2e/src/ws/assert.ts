import type { WsHandle } from '../ws-client.js';

/**
 * Waits for the next WebSocket message that satisfies `predicate`.
 * Times out after `timeoutMs` (default 8000).
 */
export async function expectWsMessage<T = unknown>(
  ws: WsHandle,
  predicate: (msg: T) => boolean,
  opts: { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const label = opts.label ?? 'expected WS message';

  return ws.waitForMessage<T>({
    timeoutMs,
    predicate,
  }).catch(() => {
    throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
  });
}

/**
 * Asserts the WebSocket closes with the given code (default 1000).
 * Times out after `timeoutMs` (default 5000).
 */
export function expectWsClose(
  ws: WsHandle,
  code = 1000,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5_000;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`WebSocket did not close with code ${code} within ${timeoutMs}ms`)),
      timeoutMs,
    );

    ws.socket.once('close', (closeCode: number) => {
      clearTimeout(timer);
      if (code !== undefined && closeCode !== code) {
        reject(new Error(`WebSocket closed with code ${closeCode}, expected ${code}`));
      } else {
        resolve();
      }
    });
  });
}
