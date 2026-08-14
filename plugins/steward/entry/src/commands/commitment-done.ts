import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { commitmentDone } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:commitment.done',
  description: 'Mark a commitment fulfilled',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [id] = input.argv;
      const { json } = input.flags;
      if (!id) {
        validationError(ctx, 'id is required', 'Usage: kb steward commitment done <id>', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const commitment = await commitmentDone({ id });
        if (!commitment) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No commitment "${id}"` } });}
          else {ctx.ui?.error?.(`No commitment "${id}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }
        if (json) {ctx.ui?.json?.({ ok: true, result: commitment });}
        else {ctx.ui?.info?.(`Done: "${commitment.text}"`);}
        return { ok: true, result: commitment };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:commitment.done failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
