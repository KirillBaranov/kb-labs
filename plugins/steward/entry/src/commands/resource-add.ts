import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { addResource } from '@kb-labs/steward-core';

type Flags = { type?: string; label?: string; url?: string; content?: string; json?: boolean };

export default defineCommand({
  id: 'steward:resource.add',
  description: 'Attach a resource to a project (repo, stand, dashboard, doc, ...)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [projectId] = input.argv;
      const { type, label, url, content, json } = input.flags;
      if (!projectId || !type?.trim() || !label?.trim()) {
        validationError(
          ctx,
          'projectId, --type, and --label are required',
          'Usage: kb steward resource add <projectId> --type=... --label=... [--url=] [--content=]',
          json,
        );
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }
      if (!url && !content) {
        validationError(ctx, 'at least one of --url/--content must be set', undefined, json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const resource = await addResource({ projectId, type, label, url, content });
        if (json) {ctx.ui?.json?.({ ok: true, result: resource });}
        else {ctx.ui?.info?.(`Added resource "${resource.label}" (${resource.type}) to project ${projectId}`);}
        return { ok: true, result: resource };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:resource.add failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
