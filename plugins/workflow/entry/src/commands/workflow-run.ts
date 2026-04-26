/**
 * workflow:run command - Run workflow by workflow ID
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import type { WorkflowRunRequest } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';
import { type WorkflowRunFlags } from '../flags.js';

type WorkflowRunInput = WorkflowRunFlags & { argv?: string[] };

function parseJsonInput(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

function parseIsolation(value: string | undefined): WorkflowRunRequest['isolation'] {
  if (!value) {
    return undefined;
  }
  if (value === 'strict' || value === 'balanced' || value === 'relaxed') {
    return value;
  }
  throw new Error(`Invalid isolation value: ${value}. Expected strict|balanced|relaxed`);
}

function parseTriggerType(value: string | undefined): WorkflowRunRequest['trigger'] {
  if (!value) {
    return undefined;
  }
  if (value === 'manual' || value === 'api' || value === 'cron') {
    return { type: value };
  }
  throw new Error(`Invalid trigger type: ${value}. Expected manual|api|cron`);
}

export default defineCommand<unknown, WorkflowRunInput, { exitCode: number }>({
  id: 'workflow:run',
  description: 'Run workflow by ID with optional target/isolation overrides',

  handler: {
    async execute(ctx: PluginContextV3, input: WorkflowRunInput): Promise<{ exitCode: number }> {
      const flags = (input as { flags?: WorkflowRunInput } & WorkflowRunInput).flags ?? input;
      const outputJson = flags.json ?? false;
      const workflowId = flags['workflow-id'];

      if (!workflowId) {
        const message = 'Missing required flag: --workflow-id';
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(message);
        }
        return { exitCode: 1 };
      }

      try {
        const request: WorkflowRunRequest = {};

        const inputPayload = parseJsonInput(flags.input);
        if (inputPayload !== undefined) {
          request.input = inputPayload;
        }

        const isolation = parseIsolation(flags.isolation);
        if (isolation) {
          request.isolation = isolation;
        }

        const trigger = parseTriggerType(flags['trigger-type']);
        if (trigger) {
          request.trigger = {
            ...trigger,
            user: flags['trigger-user'],
          };
        } else if (flags['trigger-user']) {
          request.trigger = {
            type: 'manual',
            user: flags['trigger-user'],
          };
        }

        const target = {
          environmentId: flags['target-environment-id'],
          workspaceId: flags['target-workspace-id'],
          namespace: flags['target-namespace'],
          workdir: flags['target-workdir'],
        };
        if (target.environmentId || target.workspaceId || target.namespace || target.workdir) {
          request.target = target;
        }

        const client = new WorkflowDaemonClient();
        const result = await client.runWorkflow(workflowId, request);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          ctx.ui?.success?.('Workflow run submitted', {
            title: 'Workflow Engine',
            sections: [{
              header: 'Details',
              items: [
                `Workflow ID: ${workflowId}`,
                `Run ID: ${result.runId}`,
                `Status: ${result.status}`,
                ...(request.isolation ? [`Isolation: ${request.isolation}`] : []),
                ...(request.target?.namespace ? [`Target Namespace: ${request.target.namespace}`] : []),
                ...(request.target?.environmentId ? [`Target Environment: ${request.target.environmentId}`] : []),
                ...(request.target?.workspaceId ? [`Target Workspace: ${request.target.workspaceId}`] : []),
              ],
            }],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to run workflow: ${message}`);
        }
        return { exitCode: 1 };
      }
    },
  },
});
