import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, createListInFolder, createListInSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListCreateFlags = {
  folder?: string;
  space?: string;
  name: string;
  json?: boolean;
};

export default defineCommand({
  id: 'clickup:list.create',
  description: 'Create a new list in a folder or space',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ListCreateFlags>) {
      const { folder, space, name, json } = input.flags;
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { exitCode: 1, result: null };
      }
      if (!folder && !space) {
        validationError(ctx, '--folder or --space is required', 'Use `kb clickup workspace` to find IDs', json);
        return { exitCode: 1, result: null };
      }

      try {
        const apiKey = requireApiKey();
        const list = folder
          ? await createListInFolder(apiKey, folder, { name })
          : await createListInSpace(apiKey, space!, { name });

        if (json) {
          ctx.ui?.json?.(list);
        } else {
          ctx.ui?.success?.('List created', {
            sections: [{ items: [`id: ${list.id}`, `name: ${list.name}`] }],
          });
        }

        return { exitCode: 0, result: list };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
