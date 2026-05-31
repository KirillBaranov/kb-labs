import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type IndexFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<IndexFlags>, { exitCode: number }>({
  id: 'mind:index',
  description: 'Build or refresh a Mind index from source files',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<IndexFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const mind = await buildMind();
      const res = await mind.index({ indexId: flags.index, scope: flags.scope, full: flags.full });

      if (flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(
        `Indexed ${res.filesIndexed} file(s), ${res.chunks} chunk(s) into "${res.indexId}" (${res.durationMs}ms)`,
      );
      return { exitCode: 0 };
    },
  },
});
