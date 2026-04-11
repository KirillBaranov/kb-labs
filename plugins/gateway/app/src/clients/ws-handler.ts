/**
 * @module gateway-app/clients/ws-handler
 *
 * WebSocket handler for observer clients (CLI, Studio, IDE).
 * Endpoint: GET /clients/connect (requires Bearer JWT)
 *
 * Supports:
 *   - client:subscribe   — start receiving events for an executionId
 *   - client:unsubscribe — stop receiving events
 *   - client:cancel      — cancel an execution (proxied to ExecutionRegistry)
 *
 * Auth: same Bearer JWT as HTTP endpoints (user or machine token, NOT host machine token).
 */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

interface WsRequest {
  headers: { authorization?: string };
  url?: string;
}
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { CancellationReason } from '@kb-labs/core-contracts';
import {
  ClientHelloSchema,
  ClientSubscribeSchema,
  ClientUnsubscribeSchema,
  ClientCancelSchema,
  CLIENT_PROTOCOL_VERSION,
  type ClientOutboundMessage,
} from '@kb-labs/gateway-contracts';
import { type JwtConfig } from '@kb-labs/gateway-auth';
import { extractBearerToken, resolveToken } from '../auth/tokens.js';
import { executionRegistry } from '../execute/execution-registry.js';
import { subscriptionRegistry } from './subscription-registry.js';

const HELLO_TIMEOUT_MS = 5_000;

function send(ws: WebSocket, msg: ClientOutboundMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createClientWsHandler(cache: ICache, jwtConfig: JwtConfig, logger: ILogger) {
  return async function clientWsHandler(
    socket: WebSocket,
    request: WsRequest,
  ): Promise<void> {
    // 1. Auth — Bearer JWT required (user or machine token)
    const queryToken = new URL(request.url ?? '/', 'http://localhost').searchParams.get('access_token');
    const token = extractBearerToken(request.headers.authorization)
      ?? queryToken
      ?? null;

    if (!token) {
      socket.close(1008, 'Missing Authorization');
      return;
    }

    const authContext = await resolveToken(token, cache, jwtConfig);
    if (!authContext) {
      socket.close(1008, 'Invalid token');
      return;
    }

    const connectionId = randomUUID();

    // 2. Wait for client:hello (with timeout)
    let helloDone = false;

    await new Promise<void>((resolve, reject) => {
      const helloTimeout = setTimeout(() => {
        if (!helloDone) {
          helloDone = true;
          socket.close(1008, 'Hello timeout');
          reject(new Error('Hello timeout'));
        }
      }, HELLO_TIMEOUT_MS);

      socket.once('message', (raw) => {
        if (helloDone) { return; }
        helloDone = true;
        clearTimeout(helloTimeout);

        try {
          const msg = ClientHelloSchema.parse(JSON.parse(raw.toString()));
          void msg; // clientVersion logged below if needed
          resolve();
        } catch {
          socket.close(1008, 'Invalid hello message');
          reject(new Error('Invalid client:hello'));
        }
      });
    }).catch(() => {
      // socket already closed
    });

    if (!helloDone || socket.readyState !== socket.OPEN) { return; }

    // 3. Register connection
    subscriptionRegistry.registerSocket(connectionId, socket);

    send(socket, {
      type: 'client:connected',
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      connectionId,
    });

    logger.debug('Client connected', { connectionId, namespaceId: authContext.namespaceId });

    // 4. Message handler
    socket.on('message', (raw) => {
      let parsed: { type: string };
      try {
        parsed = JSON.parse(raw.toString()) as { type: string };
      } catch {
        send(socket, {
          type: 'client:error',
          code: 'INVALID_MESSAGE',
          message: 'Malformed JSON',
        });
        return;
      }

      switch (parsed.type) {
        case 'client:subscribe': {
          const result = ClientSubscribeSchema.safeParse(parsed);
          if (!result.success) {
            send(socket, { type: 'client:error', code: 'INVALID_MESSAGE', message: 'Invalid subscribe message' });
            return;
          }
          const { executionId } = result.data;

          // Verify execution exists and belongs to this namespace
          const execution = executionRegistry.get(executionId);
          if (!execution) {
            send(socket, { type: 'client:error', code: 'EXECUTION_NOT_FOUND', message: `Execution ${executionId} not found`, executionId });
            return;
          }
          if (execution.namespaceId !== authContext.namespaceId) {
            send(socket, { type: 'client:error', code: 'FORBIDDEN', message: 'Execution belongs to another namespace', executionId });
            return;
          }

          subscriptionRegistry.subscribe(connectionId, executionId);
          break;
        }

        case 'client:unsubscribe': {
          const result = ClientUnsubscribeSchema.safeParse(parsed);
          if (!result.success) {
            send(socket, { type: 'client:error', code: 'INVALID_MESSAGE', message: 'Invalid unsubscribe message' });
            return;
          }
          subscriptionRegistry.unsubscribe(connectionId, result.data.executionId);
          break;
        }

        case 'client:cancel': {
          const result = ClientCancelSchema.safeParse(parsed);
          if (!result.success) {
            send(socket, { type: 'client:error', code: 'INVALID_MESSAGE', message: 'Invalid cancel message' });
            return;
          }
          const { executionId, reason } = result.data;

          const execution = executionRegistry.get(executionId);
          if (!execution) {
            send(socket, { type: 'client:error', code: 'EXECUTION_NOT_FOUND', message: `Execution ${executionId} not found`, executionId });
            return;
          }
          if (execution.namespaceId !== authContext.namespaceId) {
            send(socket, { type: 'client:error', code: 'FORBIDDEN', message: 'Execution belongs to another namespace', executionId });
            return;
          }

          const cancelled = executionRegistry.cancel(executionId, (reason ?? 'user') as CancellationReason);
          if (!cancelled) {
            send(socket, { type: 'client:error', code: 'CANCEL_FAILED', message: 'Execution already completed or cancelled', executionId });
          }
          break;
        }

        default:
          send(socket, { type: 'client:error', code: 'INVALID_MESSAGE', message: `Unknown message type: ${String(parsed.type)}` });
      }
    });

    // 5. Disconnect cleanup
    socket.on('close', () => {
      subscriptionRegistry.removeConnection(connectionId);
      logger.debug('Client disconnected', { connectionId });
    });
  };
}
