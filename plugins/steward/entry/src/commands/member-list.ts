import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listMembers } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:member.list',
  description: 'List members of a project, ordered by fallback priority',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [projectId] = input.argv;
      const { json } = input.flags;
      if (!projectId) {
        validationError(ctx, 'projectId is required', 'Usage: kb steward member list <projectId>', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const members = await listMembers(projectId);
        if (json) {ctx.ui?.json?.({ ok: true, result: members });}
        else if (members.length === 0) {ctx.ui?.info?.('No members yet.');}
        else {ctx.ui?.chain?.(members.map((m) => ({ title: `${m.role} (priority ${m.priority})`, sections: [{ items: [m.personId] }] })));}
        return { ok: true, result: members };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:member.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
