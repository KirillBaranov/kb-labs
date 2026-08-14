import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addEvent } from '@kb-labs/steward-core';

type Flags = { 'subject-type'?: string; 'subject-id'?: string; text?: string; kind?: string; json?: boolean };

const SUBJECT_TYPES = ['project', 'person', 'commitment', 'company', 'resource'] as const;

export default defineCommand({
  id: 'steward:event.add',
  description: 'Record a manual note against a project, person, or commitment — the primary tool for backfill import',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const subjectType = input.flags['subject-type'];
      const subjectId = input.flags['subject-id'];
      const { text, kind, json } = input.flags;

      if (!subjectType || !SUBJECT_TYPES.includes(subjectType as (typeof SUBJECT_TYPES)[number])) {
        validationError(ctx, `--subject-type must be one of: ${SUBJECT_TYPES.join(', ')}`, undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }
      if (!subjectId) {
        validationError(ctx, '--subject-id is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const event = await addEvent({
          subjectType: subjectType as (typeof SUBJECT_TYPES)[number],
          subjectId,
          text,
          kind: kind ?? 'note',
        });
        if (json) {ctx.ui?.json?.({ ok: true, result: event });}
        else {ctx.ui?.info?.(`Recorded event "${event.kind}" on ${subjectType}:${subjectId}`);}
        return { ok: true, result: event };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:event.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
