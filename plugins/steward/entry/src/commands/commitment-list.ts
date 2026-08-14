import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listCommitments } from '@kb-labs/steward-core';

type Flags = { status?: string; project?: string; 'stale-only'?: boolean; json?: boolean };

export default defineCommand({
  id: 'steward:commitment.list',
  description: 'List commitments, optionally only the stale (overdue, unsnoozed) ones',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const { status, project, json } = input.flags;
      const staleOnly = input.flags['stale-only'] ?? false;
      try {
        const commitments = await listCommitments({
          status: status as 'open' | 'done' | 'dropped' | undefined,
          projectId: project,
          staleOnly,
        });
        if (json) {ctx.ui?.json?.({ ok: true, result: commitments });}
        else if (commitments.length === 0) {ctx.ui?.info?.('Nothing here.');}
        else {ctx.ui?.chain?.(commitments.map((c) => ({ title: `[${c.status}] ${c.text}`, sections: [{ items: [c.id] }] })));}
        return { ok: true, result: commitments };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:commitment.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
