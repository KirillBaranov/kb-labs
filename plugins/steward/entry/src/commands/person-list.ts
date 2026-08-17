import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listPeople } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:person.list',
  description: 'List every known contact',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { json } = input.flags;
      try {
        const people = await listPeople();
        if (json) {ctx.ui?.json?.({ ok: true, result: people });}
        else if (people.length === 0) {ctx.ui?.info?.('No contacts yet.');}
        else {ctx.ui?.chain?.(people.map((p) => ({ title: p.name, sections: [{ items: [p.globalTopics.join(', ') || '(no topics)'] }] })));}
        return { ok: true, result: people };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:person.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
