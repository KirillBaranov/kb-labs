import { rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Returns Fastify listen options for the current process.
 *
 * When KB_SOCKET_PATH is set (injected by kb-dev), returns a unix socket
 * path instead of TCP — eliminating an extra port per service in solo/dev mode.
 * Cleans up a stale socket file from a previous crash before binding.
 */
export function getListenOptions(
  port: number,
  host = '127.0.0.1',
): { port: number; host: string } | { path: string } {
  const socket = process.env.KB_SOCKET_PATH;
  if (socket) {
    rmSync(socket, { force: true });
    mkdirSync(dirname(socket), { recursive: true });
    return { path: socket };
  }
  return { port, host };
}
