import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, createFolder } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type FolderCreateFlags = {
  space: string;
  name: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'clickup:folder.create',
  description: 'Create a new folder in a space',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<FolderCreateFlags>) {
      const { space, name, json, full } = input.flags;
      if (!space) {
        validationError(ctx, '--space is required', 'Use `kb clickup workspace` to find the space ID', json);
        return { exitCode: 1, result: null };
      }
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { exitCode: 1, result: null };
      }

      try {
        const folder = await createFolder(requireApiKey(), space, { name });

        if (json) {
          ctx.ui?.json?.(full ? folder : { id: folder.id, name: folder.name });
        } else {
          ctx.ui?.success?.('Folder created', {
            sections: [{ items: [`id: ${folder.id}`, `name: ${folder.name}`] }],
          });
        }

        return { exitCode: 0, result: folder };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
