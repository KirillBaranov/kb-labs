/**
 * workflow:health command - Check daemon health
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type HealthFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type HealthInput = HealthFlags & { argv?: string[] };

export default defineCommand<unknown, HealthInput, { exitCode: number }>({
  id: 'workflow:health',
  description: 'Check workflow daemon health status',

  handler: {
    async execute(ctx: PluginContextV3, input: HealthInput): Promise<{ exitCode: number }> {
      const flags = (input as any).flags ?? input;
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
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to check daemon health: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }

        return { exitCode: 1 };
      }
    },
  },
});
