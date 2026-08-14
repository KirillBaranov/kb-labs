import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { updateProject } from '@kb-labs/steward-core';

type Flags = { status?: string; description?: string; json?: boolean };

export default defineCommand({
  id: 'steward:project.update',
  description: "Update a project's status or description",

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [id] = input.argv;
      const { status, description, json } = input.flags;
      if (!id) {
        validationError(ctx, 'id is required', 'Usage: kb steward project update <id> [--status] [--description]', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const project = await updateProject({
          id,
          status: status as 'active' | 'paused' | 'archived' | undefined,
          description,
        });
        if (!project) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No project "${id}"` } });}
          else {ctx.ui?.error?.(`No project "${id}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }

        if (json) {ctx.ui?.json?.({ ok: true, result: project });}
        else {ctx.ui?.info?.(`Updated "${project.name}" → [${project.status}]`);}
        return { ok: true, result: project };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:project.update failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
