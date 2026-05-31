import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type SyncListFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncListFlags>, { exitCode: number }>({
  id: 'mind:sync-status',
  description: 'Show sync health for an index',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncListFlags>): Promise<{ exitCode: number }> {
      try {
      const mind = await buildMind(ctx.cwd);
      const res = await mind.syncStatus(input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { exitCode: 0 };
      }
      ctx.ui?.success?.(
        `"${res.indexId}": ${res.documents} doc(s), ${res.chunks} chunk(s)` +
          (res.lastIndexedAt ? `, updated ${res.lastIndexedAt}` : '') +
          (res.stale ? ' (stale)' : ''),
      );
      return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
