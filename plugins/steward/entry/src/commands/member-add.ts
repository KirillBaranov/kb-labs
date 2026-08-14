import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addMember } from '@kb-labs/steward-core';
import { parseList } from '../utils/flags.js';

type Flags = { person?: string; project?: string; role?: string; topics?: string; priority?: number; json?: boolean };

export default defineCommand({
  id: 'steward:member.add',
  description: 'Link a person to a project with a role and fallback priority',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { person, project, role, topics, priority, json } = input.flags;
      if (!person || !project || !role?.trim()) {
        validationError(ctx, '--person, --project, and --role are required', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const member = await addMember({
          personId: person,
          projectId: project,
          role,
          topics: parseList(topics),
          priority: priority !== undefined ? Number(priority) : 0,
        });
        if (json) {ctx.ui?.json?.({ ok: true, result: member });}
        else {ctx.ui?.info?.(`Linked ${person} to ${project} as "${role}" (priority ${member.priority})`);}
        return { ok: true, result: member };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:member.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
