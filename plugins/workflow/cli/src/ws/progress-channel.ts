/**
 * @module @kb-labs/workflow-cli/ws/progress-channel
 * WebSocket channel for real-time job progress updates
 */

import { defineWebSocket, defineMessage, MessageRouter } from '@kb-labs/sdk';

// Define typed messages
const SubscribeMsg = defineMessage<{ jobId: string }>('subscribe');
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const UnsubscribeMsg = defineMessage<{}>('unsubscribe');

const StepStartMsg = defineMessage<{ stepName: string; stepIndex: number }>('step_start');

// Type-only message definitions (used only in type unions)
type StepProgressMsg = ReturnType<typeof defineMessage<{ stepName: string; progress: number; message?: string }>>;
type StepCompleteMsg = ReturnType<typeof defineMessage<{
  stepName: string;
  status: 'completed' | 'failed';
  durationMs: number;
  error?: string;
}>>;
type JobCompleteMsg = ReturnType<typeof defineMessage<{ jobId: string; status: string; durationMs: number }>>;

const ErrorMsg = defineMessage<{ error: string }>('error');

// Incoming/Outgoing types
type Incoming = ReturnType<typeof SubscribeMsg.create> | ReturnType<typeof UnsubscribeMsg.create>;

type Outgoing =
  | ReturnType<typeof StepStartMsg.create>
  | StepProgressMsg
  | StepCompleteMsg
  | JobCompleteMsg
  | ReturnType<typeof ErrorMsg.create>;

export default defineWebSocket<unknown, Incoming, Outgoing>({
  path: '/progress/:jobId',
  description: 'Real-time job progress updates',

  handler: {
    async onConnect(ctx, sender) {
      // Note: jobId will come from path params via runtime, not ctx.params
      ctx.platform.logger.info('[progress-channel] Client connected', { connectionId: sender.getConnectionId() });

      // TODO: Subscribe to progress events from daemon/engine
      // Client needs to send Subscribe message with jobId
    },

    async onMessage(ctx, message, sender) {
      const router = new MessageRouter()
        .on(SubscribeMsg, async (ctx, payload, _rawSender) => {
          const { jobId } = payload;

          ctx.platform.logger.info('[progress-channel] Subscribed to progress updates', { jobId });

          // TODO: Start streaming progress updates from engine
          // For now, send confirmation via step start message
          await sender.send(
            StepStartMsg.create({
              stepName: 'initialization',
              stepIndex: 0,
            })
          );
        })
        .on(UnsubscribeMsg, async (ctx, _payload, _rawSender) => {
          ctx.platform.logger.info('[progress-channel] Unsubscribed from progress updates');
          // TODO: Stop streaming
        });

      await router.handle(ctx, message as any, sender.raw);
    },

    async onDisconnect(ctx, code, reason) {
      ctx.platform.logger.info('[progress-channel] Client disconnected', { code, reason });
      // TODO: Cleanup subscriptions
    },

    async onError(ctx, error, sender) {
      ctx.platform.logger.error('[progress-channel] Error', error);
      try {
        await sender.send(ErrorMsg.create({ error: error.message }));
      } catch (sendError) {
        ctx.platform.logger.error('[progress-channel] Failed to send error message', sendError instanceof Error ? sendError : undefined);
      }
    },
  },
});
