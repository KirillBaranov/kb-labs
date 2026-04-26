/**
 * @module gateway-app/ws/gateway-ws
 *
 * Unified WebSocket upgrade handler for the gateway.
 *
 * Intercepts upgrade requests BEFORE @fastify/http-proxy:
 *   - Gateway-own WS paths (/hosts/connect, /clients/connect) → raw ws handlers
 *   - Everything else → delegated to @fastify/http-proxy for upstream WS proxy
 *
 * This eliminates the conflict between @fastify/websocket and @fastify/http-proxy
 * which both try to attach 'upgrade' listeners and call assignSocket().
 */

import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { createWsHandler } from '../hosts/ws-handler.js';
import { createClientWsHandler } from '../clients/ws-handler.js';
import type { HostRegistry } from '../hosts/registry.js';

const GATEWAY_WS_PATHS = new Set(['/hosts/connect', '/clients/connect']);

/**
 * Attach gateway-own WebSocket endpoints using raw `ws` package.
 *
 * Must be called AFTER `app.ready()` (so http-proxy has registered its
 * upgrade listener) but BEFORE `app.listen()`.
 *
 * Captures all existing 'upgrade' listeners, removes them, then installs
 * a single unified handler that dispatches:
 *   - Gateway WS paths → raw ws handlers
 *   - All other paths → delegated to captured listeners (http-proxy)
 */
export function attachGatewayWs(
  server: Server,
  cache: ICache,
  jwtConfig: JwtConfig,
  logger: ILogger,
  hostRegistry?: HostRegistry,
): void {
  const wss = new WebSocketServer({ noServer: true });
  const hostsHandler = createWsHandler(cache, jwtConfig, logger, hostRegistry);
  const clientsHandler = createClientWsHandler(cache, jwtConfig, logger);

  // Capture @fastify/http-proxy's upgrade listener(s)
  const existingListeners = server.listeners('upgrade').slice() as Array<
    (req: IncomingMessage, socket: Duplex, head: Buffer) => void
  >;
  server.removeAllListeners('upgrade');

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (GATEWAY_WS_PATHS.has(pathname)) {
      // Gateway-own WS — handle directly with raw ws
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (pathname === '/hosts/connect') {
          hostsHandler(ws, req);
        } else {
          clientsHandler(ws, req);
        }
      });
    } else {
      // Delegate to @fastify/http-proxy for upstream WS proxy
      for (const listener of existingListeners) {
        listener.call(server, req, socket, head);
      }
    }
  });

  logger.info('Gateway WS endpoints attached', { paths: [...GATEWAY_WS_PATHS] });
}
