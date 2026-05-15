import { defineCommand, validationError, handleError, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface DisableFlags { json?: boolean; scope?: string }
interface DisableInput { argv?: string[]; flags?: DisableFlags }

export default defineCommand<unknown, DisableInput, { packageId: string; scope: string }>({
  id: 'marketplace:plugins:disable',
  description: 'Disable a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: DisableInput): Promise<CommandResult<{ packageId: string; scope: string }>> {
      const packageId = input.argv?.[0];
      const flags = (input.flags ?? input) as DisableFlags;

      if (!packageId) {
        validationError(ctx, 'Specify a plugin to disable', 'Usage: kb marketplace plugins disable <plugin-id>', flags.json);
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          validationError(ctx, err.message, undefined, flags.json);
        } else {
          handleError(ctx, err, flags.json);
        }
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }

      try {
        await post(`/packages/disable`, { packageId, ...scopeBody(scopeCtx) });
        if (flags.json) {
          ctx.ui?.json?.({ ok: true, packageId, scope: scopeCtx.scope });
        } else {
          ctx.ui?.success?.(`Disabled ${packageId} (${scopeCtx.scope})`);
        }
        return { exitCode: 0, result: { packageId, scope: scopeCtx.scope } };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1, result: { packageId: '', scope: '' } };
      }
    },
  },
});
