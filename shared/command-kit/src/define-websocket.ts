/**
 * Define a WebSocket channel handler with enhanced DX
 *
 * Provides type-safe WebSocket handlers following the same pattern as defineCommand, defineRoute, etc.
 */

import type { PluginContextV3, CommandResult, HostContext } from '@kb-labs/plugin-contracts';
import type { WSSender, WSInput, WSMessage } from '@kb-labs/plugin-contracts';

/**
 * Validate that a message conforms to WSMessage structure
 * @throws {Error} if message is invalid
 */
function validateWSMessage(message: unknown): asserts message is WSMessage {
  if (!message || typeof message !== 'object') {
    throw new Error('Invalid WebSocket message: must be an object');
  }

  const msg = message as Record<string, unknown>;

  if (typeof msg.type !== 'string' || msg.type.length === 0) {
    throw new Error('Invalid WebSocket message: type must be a non-empty string');
  }

  if (msg.timestamp !== undefined && typeof msg.timestamp !== 'number') {
    throw new Error('Invalid WebSocket message: timestamp must be a number');
  }

  if (msg.messageId !== undefined && typeof msg.messageId !== 'string') {
    throw new Error('Invalid WebSocket message: messageId must be a string');
  }
}

/**
 * Typed sender with message builders
 *
 * Wraps WSSender to provide generic type support for outgoing messages.
 */
export interface TypedSender<TOutgoing = WSMessage> extends Omit<WSSender, 'send' | 'broadcast' | 'sendTo'> {
  /** Send typed message to this client */
  send(message: TOutgoing): Promise<void>;
  /** Broadcast typed message to all clients in channel */
  broadcast(message: TOutgoing, excludeSelf?: boolean): Promise<void>;
  /** Send typed message to specific connections */
  sendTo(connectionIds: string[], message: TOutgoing): Promise<void>;
  /** Original WSSender methods for raw messages */
  raw: WSSender;
}

/**
 * Create typed sender wrapper
 */
function createTypedSender<TOutgoing = WSMessage>(raw: WSSender): TypedSender<TOutgoing> {
  return {
    send: (msg) => raw.send(msg as WSMessage),
    broadcast: (msg, exclude) => raw.broadcast(msg as WSMessage, exclude),
    sendTo: (ids, msg) => raw.sendTo(ids, msg as WSMessage),
    close: raw.close.bind(raw),
    getConnectionId: raw.getConnectionId.bind(raw),
    raw,
  };
}

/**
 * WebSocket handler with typed messages
 */
export interface WebSocketHandler<TConfig = unknown, TIncoming = unknown, TOutgoing = WSMessage> {
  /**
   * Called when client connects
   */
  onConnect?(
    context: PluginContextV3<TConfig>,
    sender: TypedSender<TOutgoing>
  ): Promise<void> | void;

  /**
   * Called when message received from client
   */
  onMessage?(
    context: PluginContextV3<TConfig>,
    message: TIncoming,
    sender: TypedSender<TOutgoing>
  ): Promise<void> | void;

  /**
   * Called when client disconnects
   */
  onDisconnect?(
    context: PluginContextV3<TConfig>,
    code: number,
    reason: string
  ): Promise<void> | void;

  /**
   * Called on error
   */
  onError?(
    context: PluginContextV3<TConfig>,
    error: Error,
    sender: TypedSender<TOutgoing>
  ): Promise<void> | void;

  /**
   * Optional cleanup - called after any lifecycle event
   */
  cleanup?(): Promise<void> | void;
}

export interface WebSocketDefinition<TConfig = unknown, TIncoming = unknown, TOutgoing = WSMessage> {
  /**
   * Channel path (e.g., "/live", "/chat")
   */
  path: string;

  /**
   * Channel description
   */
  description?: string;

  /**
   * Handler implementation
   */
  handler: WebSocketHandler<TConfig, TIncoming, TOutgoing>;

  /**
   * Optional message schema validation (future: use Zod/JSON Schema)
   */
  schema?: unknown;
}

/**
 * Define a WebSocket channel handler
 *
 * @example Basic usage
 * ```typescript
 * export default defineWebSocket({
 *   path: '/chat',
 *   handler: {
 *     async onConnect(ctx, sender) {
 *       await sender.send({ type: 'ready', payload: {}, timestamp: Date.now() });
 *     },
 *     async onMessage(ctx, message, sender) {
 *       console.log('Received:', message);
 *     },
 *   }
 * });
 * ```
 *
 * @example With typed messages
 * ```typescript
 * interface IncomingMsg {
 *   type: 'start' | 'stop';
 *   payload: { scope?: string };
 * }
 *
 * interface OutgoingMsg {
 *   type: 'progress' | 'complete';
 *   payload: { progress: number; message: string };
 * }
 *
 * export default defineWebSocket<unknown, IncomingMsg, OutgoingMsg>({
 *   path: '/live',
 *   handler: {
 *     async onMessage(ctx, message, sender) {
 *       if (message.type === 'start') {
 *         await sender.send({
 *           type: 'progress',
 *           payload: { progress: 50, message: 'Processing...' },
 *         });
 *       }
 *     }
 *   }
 * });
 * ```
 *
 * @example With message router (advanced pattern matching)
 * ```typescript
 * import { defineMessage, MessageRouter } from '@kb-labs/sdk';
 *
 * // Define message types
 * const StartMsg = defineMessage<{ scope?: string }>('start');
 * const StopMsg = defineMessage<object>('stop');
 *
 * // Create outgoing message builders
 * const ProgressMsg = defineMessage<{ phase: string; progress: number }>('progress');
 * const CompleteMsg = defineMessage<{ commits: any[] }>('complete');
 *
 * export default defineWebSocket({
 *   path: '/live',
 *   handler: {
 *     async onMessage(ctx, message, sender) {
 *       const router = new MessageRouter()
 *         .on(StartMsg, async (ctx, payload, sender) => {
 *           await sender.send(ProgressMsg.create({
 *             phase: 'analyzing',
 *             progress: 0,
 *           }));
 *         })
 *         .on(StopMsg, async (ctx, payload, sender) => {
 *           sender.close(1000, 'Stopped by user');
 *         });
 *
 *       await router.handle(ctx, message, sender.raw);
 *     }
 *   }
 * });
 * ```
 */
export function defineWebSocket<TConfig = unknown, TIncoming = unknown, TOutgoing = WSMessage>(
  definition: WebSocketDefinition<TConfig, TIncoming, TOutgoing>
) {
  // Return a unified handler that router can call with WSInput
  return {
    async execute(context: PluginContextV3<TConfig>, input: WSInput): Promise<CommandResult | void> {
      // Validate host type at runtime
      if (context.host !== 'ws') {
        throw new Error(
          `WebSocket channel ${definition.path} can only run in ws host (current: ${context.host})`
        );
      }

      // Validate channel path if provided in host context
      if (isWSHost(context.hostContext)) {
        const expectedPath = definition.path;
        const actualPath = context.hostContext.channelPath;
        if (actualPath !== expectedPath) {
          throw new Error(
            `WebSocket expects channel ${expectedPath} but got ${actualPath}`
          );
        }
      }

      // Get sender from input (passed from channel-mounter)
      const sender = input.sender;
      if (!sender && input.event !== 'disconnect') {
        throw new Error('WebSocket sender not provided in input');
      }

      // Create typed sender wrapper (only if sender is available)
      const typedSender = sender ? createTypedSender<TOutgoing>(sender) : undefined;

      // Route to appropriate lifecycle handler
      try {
        switch (input.event) {
          case 'connect':
            if (typedSender) {
              await definition.handler.onConnect?.(context, typedSender);
            }
            break;

          case 'message':
            if (input.message && typedSender && sender) {
              // Validate message structure before processing
              try {
                validateWSMessage(input.message);
              } catch (error) {
                // Log validation error and send error message to client
                context.platform.logger.error('Invalid WebSocket message received', error as Error, {
                  connectionId: sender.getConnectionId(),
                  message: input.message,
                });
                // Send error response to client
                await sender.send({
                  type: 'error',
                  payload: { error: 'Invalid message format' },
                  timestamp: Date.now(),
                });
                break;
              }

              // Parse incoming message as TIncoming (now validated)
              const incomingMessage = input.message as unknown as TIncoming;
              await definition.handler.onMessage?.(context, incomingMessage, typedSender);
            }
            break;

          case 'disconnect':
            await definition.handler.onDisconnect?.(
              context,
              input.disconnectCode ?? 1000,
              input.disconnectReason ?? ''
            );
            break;

          case 'error':
            if (input.error && typedSender) {
              await definition.handler.onError?.(context, input.error, typedSender);
            }
            break;
        }
      } finally {
        // Always call cleanup after lifecycle event
        await definition.handler.cleanup?.();
      }

      return { exitCode: 0 };
    },
  };
}

/**
 * Type guard to check if host context is WebSocket
 */
export function isWSHost(
  hostContext: HostContext
): hostContext is Extract<HostContext, { host: 'ws' }> {
  return hostContext.host === 'ws';
}
