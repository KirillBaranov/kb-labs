import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, createListInFolder, createListInSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListCreateFlags = {
  folder?: string;
  space?: string;
  name: string;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:list.create',
  description: 'Create a new list in a folder or space',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<ListCreateFlags>) {
      const { folder, space, name } = input.flags;
      const parent = folder ? `folder ${folder}` : space ? `space ${space}` : '(unknown)';
      return {
        summary: `Create list "${name}" in ${parent}`,
        operations: [{ type: 'create' as const, resource: 'list', details: { folder, space, name } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<ListCreateFlags>) {
      const { folder, space, name, json, full } = input.flags;
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!folder && !space) {
        validationError(ctx, '--folder or --space is required', 'Use `kb clickup workspace` to find IDs', json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const apiKey = requireApiKey();
        const list = folder
          ? await createListInFolder(apiKey, folder, { name })
          : await createListInSpace(apiKey, space!, { name });

        if (json) {
          ctx.ui?.json?.(full ? list : { id: list.id, name: list.name });
        } else {
          ctx.ui?.success?.('List created', {
            sections: [{ items: [`id: ${list.id}`, `name: ${list.name}`] }],
          });
        }

        return { ok: true, result: list };
      } catch (err) {
        handleError(ctx, err, json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
