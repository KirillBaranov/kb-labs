import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { CommandResult } from '@kb-labs/sdk';
import { type SyncListFlags, type SyncListResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncListFlags>, SyncListResponse>({
  id: 'mind:sync-list',
  description: 'List documents synced into an index',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncListFlags>): Promise<CommandResult<SyncListResponse>> {
      try {
      const mind = await buildMind(ctx.cwd);
      const res = await mind.syncList(input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { ok: true, result: res };
      }
      if (res.documents.length === 0) {
        ctx.ui?.warn?.(`Index "${res.indexId}" has no documents.`);
        return { ok: true, result: res };
      }
      ctx.ui?.success?.(`"${res.indexId}" — ${res.documents.length} document(s)`, {
        sections: [
          {
            header: 'Documents',
            items: res.documents.map((d) => `${d.path} (${d.chunks} chunk(s))`),
          },
        ],
      });
      return { ok: true, result: res };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
