import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, requireTeamId, createSpace } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type SpaceCreateFlags = {
  name: string;
  color?: string;
  private?: boolean;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:space.create',
  description: 'Create a new space',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<SpaceCreateFlags>) {
      const { name } = input.flags;
      return {
        summary: `Create space "${name ?? '(unnamed)'}"`,
        operations: [{ type: 'create' as const, resource: 'space', details: { name } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<SpaceCreateFlags>) {
      const { name, color, json, full } = input.flags;
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { exitCode: 1, result: null };
      }

      try {
        const space = await createSpace(requireApiKey(), requireTeamId(), {
          name,
          color,
          private: input.flags.private ?? false,
        });

        if (json) {
          ctx.ui?.json?.(full ? space : { id: space.id, name: space.name });
        } else {
          ctx.ui?.success?.('Space created', {
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
