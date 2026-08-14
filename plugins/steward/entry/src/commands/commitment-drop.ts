import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { commitmentDrop } from '@kb-labs/steward-core';

type Flags = { reason?: string; json?: boolean };

export default defineCommand({
  id: 'steward:commitment.drop',
  description: 'Cancel a commitment — reason is required and recorded in history',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [id] = input.argv;
      const { reason, json } = input.flags;
      if (!id || !reason?.trim()) {
        validationError(ctx, 'id and --reason are required', 'Usage: kb steward commitment drop <id> --reason=...', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const commitment = await commitmentDrop({ id, reason });
        if (!commitment) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No commitment "${id}"` } });}
          else {ctx.ui?.error?.(`No commitment "${id}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }
        if (json) {ctx.ui?.json?.({ ok: true, result: commitment });}
        else {ctx.ui?.info?.(`Dropped: "${commitment.text}" (${reason})`);}
        return { ok: true, result: commitment };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:commitment.drop failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
