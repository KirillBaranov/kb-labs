import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addProject } from '@kb-labs/steward-core';

type Flags = { name?: string; status?: string; description?: string; json?: boolean };

export default defineCommand({
  id: 'steward:project.add',
  description: 'Create a new project',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { name, status, description, json } = input.flags;
      if (!name?.trim()) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const project = await addProject({
          name,
          status: (status as 'active' | 'paused' | 'archived') ?? 'active',
          description,
        });

        if (json) {
          ctx.ui?.json?.({ ok: true, result: project });
        } else {
          ctx.ui?.info?.(`Created project "${project.name}" (${project.id})`);
        }
        return { ok: true, result: project };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:project.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
