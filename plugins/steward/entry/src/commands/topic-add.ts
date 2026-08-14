import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addTopic } from '@kb-labs/steward-core';
import { parseList } from '../utils/flags.js';

type Flags = { name?: string; aliases?: string; json?: boolean };

export default defineCommand({
  id: 'steward:topic.add',
  description: 'Register a topic with aliases in the routing dictionary — do this deliberately, not automatically',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { name, aliases, json } = input.flags;
      if (!name?.trim()) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const topic = await addTopic({ name, aliases: parseList(aliases) ?? [] });
        if (json) {ctx.ui?.json?.({ ok: true, result: topic });}
        else {ctx.ui?.info?.(`Registered topic "${topic.name}" (aliases: ${topic.aliases.join(', ') || 'none'})`);}
        return { ok: true, result: topic };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:topic.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
