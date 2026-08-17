import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { whoToContact } from '@kb-labs/steward-core';

type Flags = { project?: string; json?: boolean };

export default defineCommand({
  id: 'steward:who',
  description: 'Find who to contact about a topic, with project-scoped priority and a global fallback',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [topic] = input.argv;
      const { project, json } = input.flags;
      if (!topic?.trim()) {
        validationError(ctx, 'topic is required', 'Usage: kb steward who <topic> [--project=]', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const candidates = await whoToContact({ topic, projectId: project });
        if (json) {
          ctx.ui?.json?.({ ok: true, result: candidates });
        } else if (candidates.length === 0) {
          ctx.ui?.info?.(`Nobody found for "${topic}".`);
        } else {
          ctx.ui?.chain?.(
            candidates.map((c, i) => ({
              title: `${i + 1}. ${c.person.name} (${c.source}${c.priority !== undefined ? `, priority ${c.priority}` : ''})`,
              sections: [{ items: [c.person.contacts.map((ct) => `${ct.channel}:${ct.value}`).join(', ') || '(no contacts)'] }],
            })),
          );
        }
        return { ok: true, result: candidates };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:who failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
