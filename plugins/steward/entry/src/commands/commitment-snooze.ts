import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { commitmentSnooze } from '@kb-labs/steward-core';
import { parseDate } from '../utils/flags.js';

type Flags = { until?: string; reason?: string; json?: boolean };

export default defineCommand({
  id: 'steward:commitment.snooze',
  description: "Postpone a commitment's reminder without cancelling it",

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [id] = input.argv;
      const { until, reason, json } = input.flags;
      if (!id || !until?.trim()) {
        validationError(ctx, 'id and --until are required', 'Usage: kb steward commitment snooze <id> --until=...', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const commitment = await commitmentSnooze({ id, until: parseDate(until), reason });
        if (!commitment) {
          if (json) {ctx.ui?.json?.({ ok: false, error: { code: 'NOT_FOUND', message: `No commitment "${id}"` } });}
          else {ctx.ui?.error?.(`No commitment "${id}"`);}
          return { ok: false, error: 'NOT_FOUND', result: null };
        }
        if (json) {ctx.ui?.json?.({ ok: true, result: commitment });}
        else {ctx.ui?.info?.(`Snoozed "${commitment.text}" until ${until}`);}
        return { ok: true, result: commitment };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:commitment.snooze failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
