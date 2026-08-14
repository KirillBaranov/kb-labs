import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getProject } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:project.get',
  description: 'Get a project card: status, resources, and members',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [idOrName] = input.argv;
      const { json } = input.flags;
      if (!idOrName) {
        validationError(ctx, 'idOrName is required', 'Usage: kb steward project get <idOrName>', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const card = await getProject(idOrName);
        if (!card) {
          if (json) {
            ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No project matching "${idOrName}"` } });
          } else {
            ctx.ui?.error?.(`No project matching "${idOrName}"`);
          }
          return { ok: false, error: 'NOT_FOUND', result: null };
        }

        if (json) {
          ctx.ui?.json?.({ ok: true, result: card });
        } else {
          ctx.ui?.info?.(`${card.project.name} [${card.project.status}] — ${card.resources.length} resources, ${card.members.length} members`);
        }
        return { ok: true, result: card };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:project.get failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
