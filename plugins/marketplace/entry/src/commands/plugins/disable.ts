import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { patch } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface DisableFlags { scope?: string }
interface DisableInput { argv?: string[]; flags?: DisableFlags }

export default defineCommand<unknown, DisableInput, { packageId: string; scope: string }>({
  id: 'marketplace:plugins:disable',
  description: 'Disable a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: DisableInput): Promise<CommandResult<{ packageId: string; scope: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a plugin to disable');
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }
      const flags = (input.flags ?? input) as DisableFlags;

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

      await patch(`/packages/${encodeURIComponent(packageId)}`, {
        enabled: false,
        ...scopeBody(scopeCtx),
      });
      ctx.ui?.success?.(`Disabled ${packageId} (${scopeCtx.scope})`);
      return { exitCode: 0, result: { packageId, scope: scopeCtx.scope } };
    },
  },
});
