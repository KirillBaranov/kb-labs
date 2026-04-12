/**
 * workflow:job-run command - Submit a raw job for execution
 */

import { defineCommand, type PluginContextV3, useLoader } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import { type RunFlags } from '../flags.js';

type RunInput = RunFlags & { argv?: string[] };

export default defineCommand<unknown, RunInput, { exitCode: number }>({
  id: 'workflow:job-run',
  description: 'Submit a raw job for execution',

  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Workflow execution with input parsing, validation, wait mode (polling + websocket logs), JSON/human output, and error handling
    async execute(ctx: PluginContextV3, input: RunInput): Promise<{ exitCode: number }> {
      const flags = (input as any).flags ?? input;
      const outputJson = flags.json ?? false;
      const handler = flags.handler;
      const inputStr = flags.input;
      const priority = flags.priority ?? 5;
      const wait = flags.wait ?? false;

      if (!handler) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: 'Missing required flag: --handler' });
        } else {
          ctx.ui?.error?.('Missing required flag: --handler');
          ctx.ui?.info?.('Usage: kb workflow job-run --handler=<handler> [--input=<json>]');
          ctx.ui?.info?.('Example: kb workflow job-run --handler=mind:rag-query --input=\'{"text":"test"}\'');
        }
        return { exitCode: 1 };
      }

      // Parse input JSON if provided
      let parsedInput: unknown;
      if (inputStr) {
        try {
          parsedInput = JSON.parse(inputStr);
        } catch (error) {
          if (outputJson) {
            ctx.ui?.json?.({ ok: false, error: 'Invalid JSON in --input flag' });
          } else {
            ctx.ui?.error?.('Invalid JSON in --input flag');
            ctx.ui?.info?.(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
          return { exitCode: 1 };
        }
      }

      try {
        const client = new WorkflowDaemonClient();

        const loader = useLoader('Submitting job...');
        loader.start();

        const result = await client.submitJob({
          handler,
          input: parsedInput,
          priority,
        });

        loader.succeed('Job submitted');

        if (wait) {
          const waitLoader = useLoader('Waiting for job completion...');
          waitLoader.start();

          // Poll job status until completion
          let maxAttempts = 60; // 60 * 2s = 2 minutes max
          // IMPORTANT: This is a polling loop, must run sequentially
          while (maxAttempts > 0) {
            await new Promise<void>(resolve => { setTimeout(resolve, 2000); }); // Wait 2s

            const status = await client.getJobStatus(result.id);

            if (status.status === 'completed') {
              waitLoader.succeed('Job completed');
              break;
            } else if (status.status === 'failed') {
              waitLoader.fail('Job failed');
              if (outputJson) {
                ctx.ui?.json?.({ ok: false, error: 'Job execution failed', jobId: result.id });
              } else {
                ctx.ui?.error?.('Job execution failed');
                ctx.ui?.info?.(`Job ID: ${result.id}`);
              }
              return { exitCode: 1 };
            }

            maxAttempts--;
          }

          if (maxAttempts === 0) {
            waitLoader.fail('Timeout waiting for job completion');
          }
        }

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          const resultItems = [
            `Job ID: ${result.id}`,
            `Status: ${result.status}`,
            `Handler: ${handler}`,
            `Priority: ${priority}`,
          ];

          if (parsedInput) {
            resultItems.push(`Input: ${JSON.stringify(parsedInput)}`);
          }

          ctx.ui?.success?.('Job Submitted Successfully', {
            title: 'Workflow Engine',
            sections: [{ header: 'Details', items: resultItems }],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to submit job: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }

        return { exitCode: 1 };
      }
    },
  },
});
