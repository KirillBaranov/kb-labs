import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { del } from '../http.js';
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

      const result = await del<{ ok: boolean; removed: string[] }>('/packages', {
        packageIds: argv,
        ...scopeBody(scopeCtx),
      });

      ctx.ui?.success?.(`Removed from ${scopeCtx.scope}: ${result.removed.join(', ')}`);
      return { exitCode: 0, result: { removed: result.removed, scope: scopeCtx.scope } };
    },
  },
});
