import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateFolder } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type FolderUpdateFlags = {
  name: string;
  json?: boolean;
  full?: boolean;
};

export default defineCommand({
  id: 'clickup:folder.update',
  description: 'Rename a folder',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<FolderUpdateFlags>) {
      const folderId = input.argv[0] as string | undefined;
      if (!folderId) {
        validationError(ctx, 'folderId is required', 'Usage: kb clickup folder update <folderId> --name "new name"', input.flags.json);
        return { exitCode: 1, result: null };
      }
      if (!input.flags.name) {
        validationError(ctx, '--name is required', undefined, input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const folder = await updateFolder(requireApiKey(), folderId, { name: input.flags.name });

        if (input.flags.json) {
          ctx.ui?.json?.(input.flags.full ? folder : { id: folder.id, name: folder.name });
        } else {
          ctx.ui?.success?.('Folder updated', {
            sections: [{ items: [`id: ${folder.id}`, `name: ${folder.name}`] }],
          });
        }

        return { exitCode: 0, result: folder };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
