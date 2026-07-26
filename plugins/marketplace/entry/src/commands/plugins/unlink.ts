import { defineCommand, validationError, handleError, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface UnlinkFlags {
  json?: boolean;
  scope?: string;
  'dry-run'?: boolean;
}

interface UnlinkInput {
  argv?: string[];
  flags?: UnlinkFlags;
}

export default defineCommand<unknown, UnlinkInput, { packageId: string; scope: string }>({
  id: 'marketplace:plugins:unlink',
  description: 'Unlink a plugin',

  handler: {
    async intent(_ctx: PluginContextV3, input: UnlinkInput) {
      const packageId = input.argv?.[0] ?? '(unknown)';
      return {
        summary: `Unlink plugin "${packageId}"`,
        operations: [{ type: 'delete' as const, resource: 'plugin-link', details: { packageId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: UnlinkInput): Promise<CommandResult<{ packageId: string; scope: string }>> {
      const packageId = input.argv?.[0];
      const flags = (input.flags ?? input) as UnlinkFlags;

      if (!packageId) {
        validationError(ctx, 'Specify a package ID to unlink', 'Usage: kb marketplace plugins unlink <plugin-id>', flags.json);
        return { ok: false, error: 'A package id is required', result: { packageId: '', scope: '' } };
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
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: { packageId: '', scope: '' } };
      }

      try {
        await post(`/packages/unlink`, { packageId, ...scopeBody(scopeCtx) });
        if (flags.json) {
          ctx.ui?.json?.({ ok: true, packageId, scope: scopeCtx.scope });
        } else {
          ctx.ui?.success?.(`Unlinked ${packageId} (${scopeCtx.scope})`);
        }
        return { ok: true, result: { packageId, scope: scopeCtx.scope } };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: { packageId: '', scope: '' } };
      }
    },
  },
});
