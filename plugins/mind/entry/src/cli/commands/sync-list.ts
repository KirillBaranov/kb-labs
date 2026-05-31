import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type SyncListFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncListFlags>, { exitCode: number }>({
  id: 'mind:sync-list',
  description: 'List documents synced into an index',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncListFlags>): Promise<{ exitCode: number }> {
      const mind = await buildMind();
      const res = await mind.syncList(input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      if (res.documents.length === 0) {
        ctx.ui?.warn?.(`Index "${res.indexId}" has no documents.`);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(`"${res.indexId}" — ${res.documents.length} document(s)`, {
        sections: [
          {
            header: 'Documents',
            items: res.documents.map((d) => `${d.path} (${d.chunks} chunk(s))`),
          },
        ],
      });
      return { exitCode: 0 };
    },
  },
});
