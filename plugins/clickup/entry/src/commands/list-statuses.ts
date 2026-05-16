import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, getListStatuses } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type ListStatusesFlags = { json?: boolean; full?: boolean };

export default defineCommand({
  id: 'clickup:list.statuses',
  description: 'List available statuses for a list',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ListStatusesFlags>) {
      const [listId] = input.argv;
      if (!listId) {
        validationError(ctx, 'List ID is required', 'Usage: kb clickup list statuses <listId>  (get IDs via `kb clickup workspace`)', input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const statuses = await getListStatuses(requireApiKey(), listId);

        if (input.flags.json) {
          ctx.ui?.json?.(input.flags.full ? statuses : statuses.map(s => ({ status: s.status, type: s.type, color: s.color })));
          return { exitCode: 0, result: statuses };
        }

        ctx.ui?.table?.(
          statuses.map(s => ({ Status: s.status, Type: s.type, Color: s.color })),
          [
            { header: 'Status', key: 'Status' },
            { header: 'Type',   key: 'Type' },
            { header: 'Color',  key: 'Color' },
          ],
        );

        return { exitCode: 0, result: statuses };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
