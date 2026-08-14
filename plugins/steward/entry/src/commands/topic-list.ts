import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listTopics } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:topic.list',
  description: 'List the topic dictionary',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { json } = input.flags;
      try {
        const topics = await listTopics();
        if (json) {ctx.ui?.json?.({ ok: true, result: topics });}
        else if (topics.length === 0) {ctx.ui?.info?.('No topics registered yet.');}
        else {ctx.ui?.chain?.(topics.map((t) => ({ title: t.name, sections: [{ items: [t.aliases.join(', ') || '(no aliases)'] }] })));}
        return { ok: true, result: topics };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:topic.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
