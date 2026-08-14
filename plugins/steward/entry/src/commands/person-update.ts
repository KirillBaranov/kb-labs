import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { updatePerson } from '@kb-labs/steward-core';
import { parseList } from '../utils/flags.js';

type Flags = { name?: string; topics?: string; company?: string; json?: boolean };

export default defineCommand({
  id: 'steward:person.update',
  description: "Update a contact's name, topics, or company",

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [id] = input.argv;
      const { name, topics, company, json } = input.flags;
      if (!id) {
        validationError(ctx, 'id is required', 'Usage: kb steward person update <id> [--name] [--topics] [--company]', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const person = await updatePerson({ id, name, globalTopics: parseList(topics), companyId: company });
        if (!person) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No person "${id}"` } });}
          else {ctx.ui?.error?.(`No person "${id}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }

        if (json) {ctx.ui?.json?.({ ok: true, result: person });}
        else {ctx.ui?.info?.(`Updated "${person.name}"`);}
        return { ok: true, result: person };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:person.update failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
