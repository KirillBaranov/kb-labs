import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listEvents } from '@kb-labs/steward-core';

type Flags = { 'subject-type'?: string; 'subject-id'?: string; kind?: string; json?: boolean };

export default defineCommand({
  id: 'steward:event.list',
  description: 'Read the history log for a subject — "what happened with X"',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { json, kind } = input.flags;
      const subjectType = input.flags['subject-type'];
      const subjectId = input.flags['subject-id'];
      try {
        const events = await listEvents({
          subjectType: subjectType as 'project' | 'person' | 'commitment' | 'company' | 'resource' | undefined,
          subjectId,
          kind,
        });
        if (json) {ctx.ui?.json?.({ ok: true, result: events });}
        else if (events.length === 0) {ctx.ui?.info?.('No events yet.');}
        else {ctx.ui?.chain?.(events.map((e) => ({ title: `[${e.kind}] ${new Date(e.at).toISOString()}`, sections: [{ items: [e.text ?? e.reason ?? '(no text)'] }] })));}
        return { ok: true, result: events };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:event.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
