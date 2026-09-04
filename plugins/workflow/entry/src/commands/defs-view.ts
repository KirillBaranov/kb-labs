/**
 * workflow:defs-view <id> command — view a single workflow definition's details
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { DefsViewFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<DefsViewFlags>, unknown>({
  id: 'workflow:defs-view',
  description: 'View workflow definition details',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DefsViewFlags>): Promise<CommandResult> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const id = flags?.id ?? argv[0];

      if (!id) {
        validationError(ctx, 'Missing workflow ID', 'Usage: kb workflow defs view <id> [--id=<id>]', outputJson);
        return { ok: false, error: 'Command failed' };
      }

      try {
        const client = new WorkflowDaemonClient();
        const workflow = await client.getWorkflow(id);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: workflow });
          return { ok: true };
        }

        const summary: string[] = [
          `Source:  ${workflow.source}`,
        ];
        if (workflow.status) { summary.push(`Status:  ${workflow.status}`); }
        if (workflow.description) { summary.push(`Description: ${workflow.description}`); }
        if (workflow.tags?.length) { summary.push(`Tags:    ${workflow.tags.join(', ')}`); }
        if (workflow.version) { summary.push(`Version: ${workflow.version}`); }
        if (workflow.pluginId) { summary.push(`Plugin:  ${workflow.pluginId}`); }
        if (workflow.updatedAt) { summary.push(`Updated: ${workflow.updatedAt}`); }

        const sections: Array<{ header: string; items: string[] }> = [
          { header: workflow.name, items: summary },
        ];

        const inputs = workflow.inputs;
        if (inputs && Object.keys(inputs).length > 0) {
          sections.push({
            header: 'Inputs',
            items: Object.entries(inputs).map(([name, spec]) => {
              const required = spec.required ? ' (required)' : '';
              const def = spec.default !== undefined ? ` [default: ${JSON.stringify(spec.default)}]` : '';
              const desc = spec.description ? ` — ${spec.description}` : '';
              return `${name}: ${spec.type}${required}${def}${desc}`;
            }),
          });
        }

        ctx.ui?.sideBox?.({
          title: id,
          status: 'success',
          sections,
        });

        return { ok: true };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
