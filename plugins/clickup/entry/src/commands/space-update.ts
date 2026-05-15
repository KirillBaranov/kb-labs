import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type SpaceUpdateFlags = {
  name?: string;
  color?: string;
  json?: boolean;
};

export default defineCommand({
  id: 'clickup:space.update',
  description: 'Update a space',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SpaceUpdateFlags>) {
      const spaceId = input.argv[0] as string | undefined;
      if (!spaceId) {
        validationError(ctx, 'spaceId is required', 'Usage: kb clickup space update <spaceId> --name "new name"', input.flags.json);
        return { exitCode: 1, result: null };
      }

      const { name, color, json } = input.flags;

      try {
        const space = await updateSpace(requireApiKey(), spaceId, { name, color });

        if (json) {
          ctx.ui?.json?.(space);
        } else {
          ctx.ui?.success?.('Space updated', {
            sections: [{ items: [`id: ${space.id}`, `name: ${space.name}`] }],
          });
        }

        return { exitCode: 0, result: space };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
