import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, deleteFolder } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type FolderDeleteFlags = {
  force?: boolean;
  json?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:folder.delete',
  description: 'Delete a folder',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<FolderDeleteFlags>) {
      const [folderId] = input.argv;
      return {
        summary: `Delete folder ${folderId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'folder', details: { folderId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<FolderDeleteFlags>) {
      const folderId = input.argv[0] as string | undefined;
      if (!folderId) {
        validationError(ctx, 'folderId is required', 'Usage: kb clickup folder delete <folderId> --force', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!input.flags.force) {
        validationError(ctx, `--force is required to delete folder ${folderId}`, 'Add --force to confirm deletion', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        await deleteFolder(requireApiKey(), folderId);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, deleted: true, folderId });
        } else {
          ctx.ui?.success?.(`Deleted folder ${folderId}`);
        }

        return { ok: true, result: { deleted: true, folderId } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
