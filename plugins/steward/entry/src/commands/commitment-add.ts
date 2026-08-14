import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addCommitment } from '@kb-labs/steward-core';
import { parseDate } from '../utils/flags.js';

type Flags = {
  text?: string;
  person?: string;
  project?: string;
  'remind-at'?: string;
  'stale-after-days'?: number;
  json?: boolean;
};

export default defineCommand({
  id: 'steward:commitment.add',
  description: 'Record a promise made to a person, with an optional soft reminder date',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { text, person, project, json } = input.flags;
      const remindAtRaw = input.flags['remind-at'];
      const staleAfterDays = input.flags['stale-after-days'];
      if (!text?.trim()) {
        validationError(ctx, '--text is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const commitment = await addCommitment({
          text,
          personId: person,
          projectId: project,
          remindAt: remindAtRaw ? parseDate(remindAtRaw) : undefined,
          staleAfterDays: staleAfterDays !== undefined ? Number(staleAfterDays) : 14,
        });
        if (json) {ctx.ui?.json?.({ ok: true, result: commitment });}
        else {ctx.ui?.info?.(`Recorded commitment "${commitment.text}" (${commitment.id})`);}
        return { ok: true, result: commitment };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:commitment.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
