import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, deleteSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type SpaceDeleteFlags = {
  force?: boolean;
  json?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:space.delete',
  description: 'Delete a space',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<SpaceDeleteFlags>) {
      const [spaceId] = input.argv;
      return {
        summary: `Delete space ${spaceId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'space', details: { spaceId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<SpaceDeleteFlags>) {
      const spaceId = input.argv[0] as string | undefined;
      if (!spaceId) {
        validationError(ctx, 'spaceId is required', 'Usage: kb clickup space delete <spaceId> --force', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!input.flags.force) {
        validationError(ctx, `--force is required to delete space ${spaceId}`, 'Add --force to confirm deletion', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        await deleteSpace(requireApiKey(), spaceId);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, deleted: true, spaceId });
        } else {
          ctx.ui?.success?.(`Deleted space ${spaceId}`);
        }

        return { ok: true, result: { deleted: true, spaceId } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
