import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../scope.js';

interface UninstallFlags {
  scope?: string;
}

interface UninstallInput {
  argv?: string[];
  flags?: UninstallFlags;
}

export default defineCommand<unknown, UninstallInput, { removed: string[]; scope: string }>({
  id: 'marketplace:uninstall',
  description: 'Uninstall package(s) from marketplace',

  handler: {
    async execute(ctx: PluginContextV3, input: UninstallInput): Promise<CommandResult<{ removed: string[]; scope: string }>> {
      const argv = input.argv ?? [];
      const flags = (input.flags ?? input) as UninstallFlags;

      if (argv.length === 0) {
        ctx.ui?.error?.('Please specify at least one package to uninstall');
        return { exitCode: 1, result: { removed: [], scope: '' } };
      }

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { removed: [], scope: '' } };
        }
        throw err;
      }

      // Server returns 204 on success; treat that as "everything you asked for
      // was removed" so the CLI has something to render.
      await post('/packages/uninstall', {
        packageIds: argv,
        ...scopeBody(scopeCtx),
      });

      ctx.ui?.success?.(`Removed from ${scopeCtx.scope}: ${argv.join(', ')}`);
      return { exitCode: 0, result: { removed: argv, scope: scopeCtx.scope } };
    },
  },
});
