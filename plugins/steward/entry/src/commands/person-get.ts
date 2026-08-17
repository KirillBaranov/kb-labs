import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getPerson } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:person.get',
  description: 'Get a contact by id or exact name',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [idOrName] = input.argv;
      const { json } = input.flags;
      if (!idOrName) {
        validationError(ctx, 'idOrName is required', 'Usage: kb steward person get <idOrName>', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const person = await getPerson(idOrName);
        if (!person) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No person matching "${idOrName}"` } });}
          else {ctx.ui?.error?.(`No person matching "${idOrName}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }

        if (json) {ctx.ui?.json?.({ ok: true, result: person });}
        else {ctx.ui?.info?.(`${person.name} — topics: ${person.globalTopics.join(', ') || '(none)'}`);}
        return { ok: true, result: person };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:person.get failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
