import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { listResources } from '@kb-labs/steward-core';

type Flags = { json?: boolean };

export default defineCommand({
  id: 'steward:resource.list',
  description: 'List resources attached to a project',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<Flags>) {
      const [projectId] = input.argv;
      const { json } = input.flags;
      if (!projectId) {
        validationError(ctx, 'projectId is required', 'Usage: kb steward resource list <projectId>', json);
        return { ok: false, error: 'INVALID_ARGS', result: null };
      }

      try {
        const resources = await listResources(projectId);
        if (json) {ctx.ui?.json?.({ ok: true, result: resources });}
        else if (resources.length === 0) {ctx.ui?.info?.('No resources yet.');}
        else {ctx.ui?.chain?.(resources.map((r) => ({ title: `${r.label} (${r.type})`, sections: [{ items: [r.url ?? '(no url)'] }] })));}
        return { ok: true, result: resources };
      } catch (err) {
        ctx.platform.logger?.error?.('steward:resource.list failed', err instanceof Error ? err : new Error(String(err)));
        handleError(ctx, err, json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: null };
      }
    },
  },
});
