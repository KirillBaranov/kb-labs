import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { del } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface UnlinkFlags {
  scope?: string;
}

interface UnlinkInput {
  argv?: string[];
  flags?: UnlinkFlags;
}

export default defineCommand<unknown, UnlinkInput, { packageId: string; scope: string }>({
  id: 'marketplace:plugins:unlink',
  description: 'Unlink a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: UnlinkInput): Promise<CommandResult<{ packageId: string; scope: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a package ID to unlink');
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }
      const flags = (input.flags ?? input) as UnlinkFlags;

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { packageId: '', scope: '' } };
        }
        throw err;
      }

      await del(`/packages/${encodeURIComponent(packageId)}/link`, scopeBody(scopeCtx));
      ctx.ui?.success?.(`Unlinked ${packageId} (${scopeCtx.scope})`);
      return { exitCode: 0, result: { packageId, scope: scopeCtx.scope } };
    },
  },
});
