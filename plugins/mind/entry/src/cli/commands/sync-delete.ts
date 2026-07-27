import { defineCommand, handleError, confirmDestructive, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { CommandResult } from '@kb-labs/sdk';
import { type SyncDeleteFlags, type SyncResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SyncDeleteFlags>, SyncResponse>({
  id: 'mind:sync-delete',
  description: 'Remove documents from an index (incremental)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SyncDeleteFlags>): Promise<CommandResult<SyncResponse>> {
      try {
      const paths = input.argv ?? [];
      if (paths.length === 0) {
        ctx.ui?.error?.('Provide one or more paths: kb mind sync delete <paths…>');
        return { ok: false, error: 'Command failed' };
      }
      // Destructive: blocks in EVERY mode until --yes (agents get a structured
      // confirmationRequired signal with severity/recovery, not a silent delete).
      const blocked = confirmDestructive(ctx, {
        confirmed: input.flags.yes,
        isJson: input.flags.json,
        action: {
          action: 'mind sync delete',
          resource: `index "${input.flags.index ?? 'default'}"`,
          effect: 'removes the specified document(s)',
          severity: 'medium',
          reversible: true,
          recovery: 're-add with `kb mind sync add <paths>`',
          blastRadius: { count: paths.length, unit: 'document(s)' },
        },
      });
      if (blocked) {
        return blocked;
      }
      const mind = await buildMind(ctx.cwd);
      const res = await mind.syncDelete(paths, input.flags.index);
      if (input.flags.json) {
        ctx.ui?.json?.(res);
        return { ok: true, result: res };
      }
      ctx.ui?.success?.(`Sync delete → "${res.indexId}": ${res.deleted} chunk(s) removed`);
      return { ok: true, result: res };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
