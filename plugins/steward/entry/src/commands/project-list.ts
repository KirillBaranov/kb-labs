import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listProjects } from '@kb-labs/steward-core';

type Flags = { status?: string; json?: boolean };

export default defineCommand({
  id: 'steward:project.list',
  description: 'List projects, optionally filtered by status',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { status, json } = input.flags;
      try {
        const projects = await listProjects({ status: status as 'active' | 'paused' | 'archived' | undefined });
        if (json) {
          ctx.ui?.json?.({ ok: true, result: projects });
        } else if (projects.length === 0) {
          ctx.ui?.info?.('No projects yet.');
        } else {
          ctx.ui?.chain?.(
            projects.map((p) => ({ title: `${p.name} [${p.status}]`, sections: [{ items: [p.id] }] })),
          );
        }
        return { ok: true, result: projects };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:project.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
