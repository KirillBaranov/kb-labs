/**
 * workflow:health command - Check daemon health
 */

import { defineCommand, handleError, type PluginContextV3 } from '@kb-labs/sdk';
import { type HealthFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type HealthInput = HealthFlags & { argv?: string[]; flags?: HealthFlags };

export default defineCommand<unknown, HealthInput, { exitCode: number }>({
  id: 'workflow:health',
  description: 'Check workflow daemon health status',

  handler: {
    async execute(ctx: PluginContextV3, input: HealthInput): Promise<{ exitCode: number }> {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;

      try {
        const client = new WorkflowDaemonClient();
        const health = await client.health();

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: health });
        } else {
          ctx.ui?.success?.('Daemon is healthy', {
            title: 'Workflow Daemon',
            sections: [
              {
                header: 'Status',
                items: [`Service: ${health.service}`, 'Health: OK'],
              },
            ],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        if (outputJson) {
          handleError(ctx, error, true);
        } else {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui?.error?.(message, { hint: 'Start with: kb-dev start workflow' });
        }
        return { exitCode: 1 };
      }
    },
  },
});
