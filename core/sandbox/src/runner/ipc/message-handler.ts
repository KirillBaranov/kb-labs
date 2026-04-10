/**
 * @module @kb-labs/core-sandbox/runner/ipc/message-handler
 * Main IPC message dispatcher
 */

import { SANDBOX_ERROR_CODES } from '../../errors/error-codes';
import type { IpcMessage } from './message-types';
import type { RunHandlerOptions } from './run-handler';
import { handleRunMessage } from './run-handler';

export type MessageHandlerOptions = Omit<RunHandlerOptions, 'payload'>;

/**
 * Setup IPC message listener
 *
 * Listens for messages from parent process and dispatches them to appropriate handlers.
 * Currently only handles RUN messages, but can be extended for other message types.
 */
export function setupMessageHandler(options: MessageHandlerOptions): void {
  const { sandboxOutput } = options;

  process.on('message', async (msg: unknown) => {
    try {
      const message = msg as IpcMessage;
      if (message?.type === 'RUN' && message.payload) {
        const payload = message.payload;
        // Validate required fields
        if (!payload.handlerRef || !payload.ctx) {
          sandboxOutput.error('Invalid RUN message: missing handlerRef or ctx', {
            code: SANDBOX_ERROR_CODES.INVALID_MESSAGE,
          });
          return;
        }
        sandboxOutput.debug(`Received RUN message, handler: ${payload.handlerRef.file}#${payload.handlerRef.export}`);
        await handleRunMessage({
          ...options,
          payload: {
            handlerRef: payload.handlerRef,
            input: payload.input,
            ctx: payload.ctx,
            perms: payload.perms,
            manifest: payload.manifest,
          },
        });
      } else if (message?.type && message.type !== 'READY' && message.type !== 'LOG') {
        sandboxOutput.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      const errorMsg = `Error handling message: ${error instanceof Error ? error.message : String(error)}`;
      sandboxOutput.error(errorMsg, {
        code: SANDBOX_ERROR_CODES.MESSAGE_HANDLER_ERROR,
      });
      if (error instanceof Error && error.stack) {
        sandboxOutput.debug(`Stack: ${error.stack}`);
      }
      // Send error back to parent
      if (process.send) {
        try {
          process.send({
            type: 'ERR',
            payload: {
              error: {
                code: 'BOOTSTRAP_ERROR',
                message: errorMsg,
                stack: error instanceof Error ? error.stack : undefined,
              },
            },
          });
        } catch {
          // Ignore if we can't send
        }
      }
    }
  });
}
