/**
 * @module @kb-labs/workflow-cli/ws/progress-channel
 * WebSocket channel for real-time job progress updates.
 *
 * WS-P01 (actual step-level progress streaming) is a planned feature.
 * WS-P02 (unknown jobId → error) is implemented via job existence check.
 */

import { defineWebSocket, defineMessage, MessageRouter } from '@kb-labs/sdk';
import type { WSMessage } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

const SubscribeMsg = defineMessage<{ jobId: string }>('subscribe');
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const UnsubscribeMsg = defineMessage<{}>('unsubscribe');
const ErrorMsg = defineMessage<{
  error: string;
  code: 'NOT_FOUND' | 'DEPENDENCY_UNAVAILABLE';
}>('error');
const StepStartMsg = defineMessage<{ stepName: string; stepIndex: number }>(
  'step_start',
);

type Incoming =
  | ReturnType<typeof SubscribeMsg.create>
  | ReturnType<typeof UnsubscribeMsg.create>;
type Outgoing =
  | ReturnType<typeof StepStartMsg.create>
  | ReturnType<typeof ErrorMsg.create>;

type ExistenceProbe =
  | { exists: true }
  | { exists: false; unavailable?: boolean };

async function checkJobExists(jobId: string): Promise<ExistenceProbe> {
  const daemonUrl = getWorkflowDaemonUrl();
  try {
    const res = await fetch(
      `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`,
    );
    if (res.status === 404) {
      return { exists: false };
    }
    if (!res.ok) {
      return { exists: false, unavailable: true };
    }
    return { exists: true };
  } catch {
    return { exists: false, unavailable: true };
  }
}

export default defineWebSocket<unknown, Incoming, Outgoing>({
  path: '/progress/:jobId',
  description: 'Real-time job progress updates',

  handler: {
    async onConnect(ctx, _sender) {
      ctx.platform.logger.info('[progress-channel] Client connected', {
        connectionId: ctx.requestId,
      });
    },

    async onMessage(ctx, message, sender) {
      const router = new MessageRouter()
        .on(SubscribeMsg, async (_ctx, payload) => {
          const { jobId } = payload;

          const probe = await checkJobExists(jobId);
          if (!probe.exists) {
            const code = probe.unavailable
              ? 'DEPENDENCY_UNAVAILABLE'
              : 'NOT_FOUND';
            const error = probe.unavailable
              ? 'Workflow daemon is unavailable; progress cannot be subscribed right now'
              : `Job ${jobId} not found`;
            await sender.send(ErrorMsg.create({ error, code }));
            sender.close(probe.unavailable ? 1013 : 1008, code);
            return;
          }

          ctx.platform.logger.info(
            '[progress-channel] Subscribed to progress',
            { jobId },
          );
          // Progress streaming is not yet implemented — send acknowledgement only
          await sender.send(
            StepStartMsg.create({ stepName: 'initialization', stepIndex: 0 }),
          );
        })
        .on(UnsubscribeMsg, async (_ctx) => {
          ctx.platform.logger.info('[progress-channel] Unsubscribed');
        });

      await router.handle(ctx, message as WSMessage, sender.raw);
    },

    async onDisconnect(ctx, _code, _reason) {
      ctx.platform.logger.info('[progress-channel] Client disconnected', {
        connectionId: ctx.requestId,
      });
    },

    async onError(ctx, error, sender) {
      ctx.platform.logger.error('[progress-channel] Error', error);
      try {
        await sender.send(
          ErrorMsg.create({
            error: error.message,
            code: 'DEPENDENCY_UNAVAILABLE',
          }),
        );
      } catch {
        // socket may be closed
      }
    },
  },
});
