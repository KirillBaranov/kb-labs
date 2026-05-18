import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, deleteList } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListDeleteFlags = {
  force?: boolean;
  json?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:list.delete',
  description: 'Delete a list',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<ListDeleteFlags>) {
      const [listId] = input.argv;
      return {
        summary: `Delete list ${listId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'list', details: { listId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<ListDeleteFlags>) {
      const listId = input.argv[0] as string | undefined;
      if (!listId) {
        validationError(ctx, 'listId is required', 'Usage: kb clickup list delete <listId> --force', input.flags.json);
        return { exitCode: 1, result: null };
      }
      if (!input.flags.force) {
        validationError(ctx, `--force is required to delete list ${listId}`, 'Add --force to confirm deletion', input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        await deleteList(requireApiKey(), listId);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, deleted: true, listId });
        } else {
          ctx.ui?.success?.(`Deleted list ${listId}`);
        }

        return { exitCode: 0, result: { deleted: true, listId } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
