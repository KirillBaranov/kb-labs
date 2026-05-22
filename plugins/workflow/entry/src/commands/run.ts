/**
 * workflow:job-run command - Submit a raw job for execution
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3, useLoader } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunFlagsInput {
  json?: boolean;
  handler?: string;
  input?: string;
  priority?: number;
  wait?: boolean;
}

export default defineCommand<unknown, CLIInput<RunFlagsInput>, { exitCode: number }>({
  id: 'workflow:job-run',
  description: 'Submit a raw job for execution',

  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Workflow execution with input parsing, validation, wait mode (polling + websocket logs), JSON/human output, and error handling
    async execute(ctx: PluginContextV3, input: CLIInput<RunFlagsInput>): Promise<{ exitCode: number }> {
      const outputJson = input.flags.json ?? false;
      const handler = input.flags.handler;
      const inputStr = input.flags.input;
      const priority = input.flags.priority ?? 5;
      const wait = input.flags.wait ?? false;

      if (!handler) {
        validationError(ctx, 'Missing required flag: --handler', 'Usage: kb workflow job-run --handler=<handler> [--input=<json>]', outputJson);
        return { exitCode: 1 };
      }

      // Parse input JSON if provided
      let parsedInput: unknown;
      if (inputStr) {
        try {
          parsedInput = JSON.parse(inputStr);
        } catch {
          validationError(ctx, 'Invalid JSON in --input flag', undefined, outputJson);
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
                ctx.ui?.error?.('Job execution failed', {
                  hint: 'Start workflow daemon with: kb-dev start workflow',
                  cause: `Job ID: ${result.id}`,
                });
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
