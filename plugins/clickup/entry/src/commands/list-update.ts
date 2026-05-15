import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateList } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListUpdateFlags = {
  name?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'clickup:list.update',
  description: 'Update a list',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ListUpdateFlags>) {
      const listId = input.argv[0] as string | undefined;
      if (!listId) {
        validationError(ctx, 'listId is required', 'Usage: kb clickup list update <listId> --name "new name"', input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const list = await updateList(requireApiKey(), listId, { name: input.flags.name });

        if (input.flags.json) {
          ctx.ui?.json?.(list);
        } else {
          ctx.ui?.success?.('List updated', {
            sections: [{ items: [`id: ${list.id}`, `name: ${list.name}`] }],
          });
        }

        return { exitCode: 0, result: list };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
