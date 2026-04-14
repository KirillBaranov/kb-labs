import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface EnableFlags { scope?: string }
interface EnableInput { argv?: string[]; flags?: EnableFlags }

export default defineCommand<unknown, EnableInput, { packageId: string; scope: string }>({
  id: 'marketplace:plugins:enable',
  description: 'Enable a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: EnableInput): Promise<CommandResult<{ packageId: string; scope: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a plugin to enable');
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }
      const flags = (input.flags ?? input) as EnableFlags;

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

      await post(`/packages/enable`, {
        packageId,
        ...scopeBody(scopeCtx),
      });
      ctx.ui?.success?.(`Enabled ${packageId} (${scopeCtx.scope})`);
      return { exitCode: 0, result: { packageId, scope: scopeCtx.scope } };
    },
  },
});
