import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type SpaceUpdateFlags = {
  name?: string;
  color?: string;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:space.update',
  description: 'Update a space',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<SpaceUpdateFlags>) {
      const [spaceId] = input.argv;
      const skipKeys = new Set(['json', 'full', 'dry-run']);
      const changes = Object.entries(input.flags)
        .filter(([k, v]) => !skipKeys.has(k) && v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
      return {
        summary: `Update space ${spaceId ?? '(unknown)'}`,
        operations: [{ type: 'update' as const, resource: 'space', details: { spaceId, changes } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<SpaceUpdateFlags>) {
      const spaceId = input.argv[0] as string | undefined;
      if (!spaceId) {
        validationError(ctx, 'spaceId is required', 'Usage: kb clickup space update <spaceId> --name "new name"', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      const { name, color, json, full } = input.flags;

      try {
        const space = await updateSpace(requireApiKey(), spaceId, { name, color });

        if (json) {
          ctx.ui?.json?.(full ? space : { id: space.id, name: space.name });
        } else {
          ctx.ui?.success?.('Space updated', {
            sections: [{ items: [`id: ${space.id}`, `name: ${space.name}`] }],
          });
        }

        return { ok: true, result: space };
      } catch (err) {
        handleError(ctx, err, json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
