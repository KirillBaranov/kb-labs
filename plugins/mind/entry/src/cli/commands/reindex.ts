import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type ReindexFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<ReindexFlags>, { exitCode: number }>({
  id: 'mind:reindex',
  description: 'Rebuild an index from source files',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ReindexFlags>): Promise<{ exitCode: number }> {
      const mind = await buildMind(ctx.cwd);
      const res = await mind.reindex({ indexId: input.flags.index, full: input.flags.full });
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(
        `Reindexed "${res.indexId}": ${res.filesIndexed} file(s), ${res.chunks} chunk(s) (${res.durationMs}ms)`,
      );
      return { exitCode: 0 };
    },
  },
});
