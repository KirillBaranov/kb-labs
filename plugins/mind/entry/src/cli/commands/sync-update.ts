import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type SyncPathsFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncPathsFlags>, { exitCode: number }>({
  id: 'mind:sync-update',
  description: 'Re-index updated documents (incremental)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncPathsFlags>): Promise<{ exitCode: number }> {
      try {
      const paths = input.argv ?? [];
      if (paths.length === 0) {
        ctx.ui?.error?.('Provide one or more paths: kb mind sync update <paths…>');
        return { exitCode: 1 };
      }
      const mind = await buildMind(ctx.cwd);
      const res = await mind.syncUpdate(paths, input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(`Sync update → "${res.indexId}": ${res.updated} updated`);
      return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
