/**
 * @module @kb-labs/plugin-execution/ws/channel-mounter
 *
 * Mount plugin WebSocket channels to Fastify server.
 * Follows the same pattern as route-mounter but for WebSocket channels.
 */

import type { FastifyInstance } from 'fastify';
import fastifyWebsocket, { type WebsocketHandler } from '@fastify/websocket';
import type {
  ManifestV3,
  PluginContextDescriptor,
  WebSocketHostContext,
  WSInput,
} from '@kb-labs/plugin-contracts';
import { DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';
import type { ExecutionBackend } from '../types.js';
import { connectionRegistry } from './connection-registry.js';
import { createWSSender } from './sender.js';

// Import utility functions (assuming they exist in utils.ts)
// If these don't exist, we'll need to create them or use alternatives
let createExecutionId: () => string;
let normalizeHeaders: (headers: Record<string, any>) => Record<string, string>;

try {
  const utils = await import('../utils.js');
  createExecutionId = utils.createExecutionId;
  normalizeHeaders = utils.normalizeHeaders;
} catch {
  // Fallback implementations if utils don't exist
  createExecutionId = () => `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  normalizeHeaders = (headers) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = String(value);
    }
    return normalized;
  };
}

export interface MountWebSocketChannelsOptions {
  /** Execution backend */
  backend: ExecutionBackend;

  /** Plugin root directory */
  pluginRoot: string;

  /** Workspace root directory */
  workspaceRoot: string;

  /** Base path prefix (optional, defaults to /v1/ws/plugins/{manifest.id}) */
  basePath?: string;

  /** Default timeout in ms (optional, default: 300000 = 5 minutes) */
  defaultTimeoutMs?: number;

  /** Default max message size in bytes (optional, default: 1MB) */
  defaultMaxMessageSize?: number;
}

/**
 * Mount plugin WebSocket channels to Fastify server.
 *
 * @param server - Fastify server instance
 * @param manifest - Plugin manifest
 * @param options - Mounting options
 * @returns Result with mounted count and errors
 */
export async function mountWebSocketChannels(
  server: FastifyInstance,
  manifest: ManifestV3,
  options: MountWebSocketChannelsOptions
): Promise<{ mounted: number; errors: string[] }> {
  const errors: string[] = [];
  let mounted = 0;

  const channels = manifest.ws?.channels ?? [];

  if (channels.length === 0) {
    return { mounted, errors };
  }

  // Register WebSocket plugin if not already registered
  if (!server.hasPlugin('@fastify/websocket')) {
    try {
      // TODO: Remove 'as any' when tsup properly supports @fastify/websocket module augmentation
      // Issue: tsup's DTS generation doesn't see Fastify module augmentation from @fastify/websocket
      // even with types: ["@fastify/websocket"] in tsconfig. This is a known limitation.
      await server.register(fastifyWebsocket as any);
    } catch (error) {
      errors.push(`Failed to register WebSocket plugin: ${error instanceof Error ? error.message : String(error)}`);
      return { mounted, errors };
    }
  }

  const basePath = options.basePath || `/v1/ws/plugins/${manifest.id}`;

  for (const channel of channels) {
    try {
      const fullPath = `${basePath}${channel.path}`;

      // Register WebSocket route
      const handler: WebsocketHandler = async (socket, request) => {
        const ws = socket;
        const connectionId = createExecutionId();

        // Extract IDs for tracing
        const requestId = (typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined) || createExecutionId();
        const traceId = (typeof request.headers['x-trace-id'] === 'string' ? request.headers['x-trace-id'] : undefined) || createExecutionId();
        const tenantId = typeof request.headers['x-tenant-id'] === 'string' ? request.headers['x-tenant-id'] : undefined;

        // Register connection
        connectionRegistry.register({
          connectionId,
          channelPath: channel.path,
          socket: ws,
          tenantId,
          metadata: {},
        });

        // Create sender interface
        const sender = createWSSender(ws, connectionId, channel.path);

        // Build WebSocketHostContext
        const hostContext: WebSocketHostContext = {
          host: 'ws',
          channelPath: channel.path,
          connectionId,
          clientIp: request.ip,
          headers: normalizeHeaders(request.headers),
          query: request.query as Record<string, string> | undefined,
          params: request.params as Record<string, string> | undefined,
          requestId,
          traceId,
          tenantId,
          // TODO: Extract user from auth token if auth is enabled
        };

        const descriptor: PluginContextDescriptor = {
          hostType: 'ws',
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          requestId,
          permissions: channel.permissions || manifest.permissions || DEFAULT_PERMISSIONS,
          hostContext,
        };
        Object.assign(descriptor as unknown as Record<string, unknown>, { traceId });

        const executeChannelHandler = async (input: WSInput, timeoutMs?: number): Promise<void> => {
          const executionId = createExecutionId();
          const result = await options.backend.execute({
            executionId,
            descriptor: Object.assign({ ...descriptor }, {
              executionId,
              spanId: executionId,
              invocationId: executionId,
            }) as PluginContextDescriptor,
            pluginRoot: options.pluginRoot,
            handlerRef: channel.handler,
            input,
            workspace: {
              type: 'local',
              cwd: options.workspaceRoot,
            },
            timeoutMs,
          });
          // Propagate backend errors so onConnect catch block can close the socket
          if (!result.ok) {
            throw new Error(result.error?.message ?? 'Handler execution failed');
          }
        };

        // Call onConnect lifecycle
        try {
          const connectInput: WSInput = { event: 'connect', sender };
          await executeChannelHandler(connectInput);
        } catch (error) {
          server.log.error(
            { err: error, plugin: manifest.id, channel: channel.path, connectionId },
            `[ws] onConnect failed — plugin "${manifest.id}", channel "${channel.path}"`
          );
          ws.close(1011, 'Handler error');
          connectionRegistry.unregister(connectionId);
          return;
        }

        // Handle incoming messages
        ws.on('message', async (data: Buffer) => {
          try {
            const rawMessage = JSON.parse(data.toString());
            const messageInput: WSInput = {
              event: 'message',
              message: {
                type: rawMessage.type,
                payload: rawMessage.payload,
                messageId: rawMessage.messageId,
                timestamp: rawMessage.timestamp || Date.now(),
              },
              sender,
            };
            await executeChannelHandler(messageInput);
          } catch (error) {
            server.log.error(
              { err: error, plugin: manifest.id, channel: channel.path, connectionId },
              `[ws] onMessage failed — plugin "${manifest.id}", channel "${channel.path}"`
            );

            // Call onError handler
            const errorInput: WSInput = {
              event: 'error',
              error: error as Error,
              sender,
            };

            try {
              await executeChannelHandler(errorInput);
            } catch (err) {
              server.log.error(
                { err, plugin: manifest.id, channel: channel.path, connectionId },
                `[ws] onError handler also failed — plugin "${manifest.id}", channel "${channel.path}"`
              );
            }
          }
        });

        // Handle disconnect
        ws.on('close', async (code: number, reason: Buffer) => {
          connectionRegistry.unregister(connectionId);

          try {
            const disconnectInput: WSInput = {
              event: 'disconnect',
              disconnectCode: code,
              disconnectReason: reason.toString(),
            };
            await executeChannelHandler(disconnectInput);
          } catch (error) {
            server.log.error(
              { err: error, plugin: manifest.id, channel: channel.path, connectionId, code },
              `[ws] onDisconnect failed — plugin "${manifest.id}", channel "${channel.path}"`
            );
          }
        });

        // Handle errors
        ws.on('error', async (error: Error) => {
          try {
            const errorInput: WSInput = {
              event: 'error',
              error,
              sender,
            };
            await executeChannelHandler(errorInput);
          } catch (err) {
            server.log.error(
              { err, plugin: manifest.id, channel: channel.path, connectionId },
              `[ws] onError handler failed — plugin "${manifest.id}", channel "${channel.path}"`
            );
          }
        });
      };

      // TODO: Remove 'as any' when tsup properly supports @fastify/websocket module augmentation
      // Same issue as register() above - tsup DTS generation doesn't see extended types
      server.get(fullPath, { websocket: true } as any, handler as any);

      mounted++;
      server.log.info({ plugin: manifest.id, channel: channel.path, fullPath }, `[ws] Mounted WebSocket channel: ${fullPath}`);
    } catch (error) {
      const errorMsg = `[ws] Failed to mount channel "${channel.path}" (plugin: ${manifest.id}): ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      server.log.error({ err: error, plugin: manifest.id, channel: channel.path }, errorMsg);
    }
  }

  return { mounted, errors };
}
