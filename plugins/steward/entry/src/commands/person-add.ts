import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addPerson } from '@kb-labs/steward-core';
import { parseList } from '../utils/flags.js';

type Flags = { name?: string; topics?: string; company?: string; json?: boolean };

export default defineCommand({
  id: 'steward:person.add',
  description: 'Add a contact. Returns a possibleDuplicates warning, not an error, on a name match',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { name, topics, company, json } = input.flags;
      if (!name?.trim()) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const { person, possibleDuplicates } = await addPerson({
          name,
          contacts: [],
          companyId: company,
          globalTopics: parseList(topics) ?? [],
        });

        if (json) {
          ctx.ui?.json?.({ ok: true, result: { person, possibleDuplicates } });
        } else {
          ctx.ui?.info?.(`Added "${person.name}" (${person.id})`);
          if (possibleDuplicates.length > 0) {
            ctx.ui?.warn?.(`Possible duplicate${possibleDuplicates.length > 1 ? 's' : ''}: ${possibleDuplicates.map((p) => p.id).join(', ')}`);
          }
        }
        return { ok: true, result: { person, possibleDuplicates } };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:person.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
