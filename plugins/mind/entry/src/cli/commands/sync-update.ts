import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { CommandResult } from '@kb-labs/sdk';
import { type SyncPathsFlags, type SyncResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncPathsFlags>, SyncResponse>({
  id: 'mind:sync-update',
  description: 'Re-index updated documents (incremental)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncPathsFlags>): Promise<CommandResult<SyncResponse>> {
      try {
      const paths = input.argv ?? [];
      if (paths.length === 0) {
        ctx.ui?.error?.('Provide one or more paths: kb mind sync update <paths…>');
        return { ok: false, error: 'Command failed' };
      }
      const mind = await buildMind(ctx.cwd);
      const res = await mind.syncUpdate(paths, input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { ok: true, result: res };
      }
      ctx.ui?.success?.(`Sync update → "${res.indexId}": ${res.updated} updated`);
      return { ok: true, result: res };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
