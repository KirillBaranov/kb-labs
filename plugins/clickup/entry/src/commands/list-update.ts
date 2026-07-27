import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateList } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListUpdateFlags = {
  name?: string;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:list.update',
  description: 'Update a list',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<ListUpdateFlags>) {
      const [listId] = input.argv;
      const skipKeys = new Set(['json', 'full', 'dry-run']);
      const changes = Object.entries(input.flags)
        .filter(([k, v]) => !skipKeys.has(k) && v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
      return {
        summary: `Update list ${listId ?? '(unknown)'}`,
        operations: [{ type: 'update' as const, resource: 'list', details: { listId, changes } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<ListUpdateFlags>) {
      const listId = input.argv[0] as string | undefined;
      if (!listId) {
        validationError(ctx, 'listId is required', 'Usage: kb clickup list update <listId> --name "new name"', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const list = await updateList(requireApiKey(), listId, { name: input.flags.name });

        if (input.flags.json) {
          ctx.ui?.json?.(input.flags.full ? list : { id: list.id, name: list.name });
        } else {
          ctx.ui?.success?.('List updated', {
            sections: [{ items: [`id: ${list.id}`, `name: ${list.name}`] }],
          });
        }

        return { ok: true, result: list };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
