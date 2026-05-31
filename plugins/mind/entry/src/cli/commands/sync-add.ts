import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type SyncPathsFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncPathsFlags>, { exitCode: number }>({
  id: 'mind:sync-add',
  description: 'Add documents to an index (incremental)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncPathsFlags>): Promise<{ exitCode: number }> {
      const paths = input.argv ?? [];
      if (paths.length === 0) {
        ctx.ui?.error?.('Provide one or more paths: kb mind sync add <paths…>');
        return { exitCode: 1 };
      }
      const mind = await buildMind();
      const res = await mind.syncAdd(paths, input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(`Sync add → "${res.indexId}": +${res.added} added, ${res.updated} updated`);
      return { exitCode: 0 };
    },
  },
});
