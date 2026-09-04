/**
 * workflow:defs-list command — list workflow definitions available to run
 */

import { defineCommand, handleError, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { DefsListFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<DefsListFlags>, unknown>({
  id: 'workflow:defs-list',
  description: 'List workflow definitions',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DefsListFlags>): Promise<CommandResult> {
      const flags = input.flags;
      const outputJson = flags?.json ?? false;

      try {
        const client = new WorkflowDaemonClient();
        const workflows = await client.listWorkflows({
          source: flags?.source,
          status: flags?.status,
          tags: flags?.tags,
        });

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: workflows });
          return { ok: true };
        }

        if (workflows.length === 0) {
          ctx.ui?.info?.('No workflow definitions found');
          return { ok: true };
        }

        ctx.ui?.table?.(
          workflows.map(wf => ({
            'ID': wf.id,
            'Name': wf.name,
            'Source': wf.source,
            'Status': wf.status ?? '',
            'Tags': (wf.tags ?? []).join(', '),
            'Version': wf.version ?? '',
          })),
          [
            { header: 'ID', key: 'ID' },
            { header: 'Name', key: 'Name' },
            { header: 'Source', key: 'Source' },
            { header: 'Status', key: 'Status' },
            { header: 'Tags', key: 'Tags' },
            { header: 'Version', key: 'Version' },
          ],
        );
        ctx.ui?.success?.(`${workflows.length} workflow(s)`);

        return { ok: true };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
