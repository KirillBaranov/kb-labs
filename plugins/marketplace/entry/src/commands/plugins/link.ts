import { defineCommand, validationError, handleError, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import * as path from 'node:path';
import { post } from '../../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../../scope.js';

interface LinkFlags {
  scope?: string;
  json?: boolean;
}

interface LinkInput {
  argv?: string[];
  flags?: LinkFlags;
}

interface LinkResponse {
  id: string;
  version: string;
  primaryKind: string;
  provides: string[];
  packageRoot: string;
  scope: string;
}

export default defineCommand<unknown, LinkInput, { id: string; scope: string }>({
  id: 'marketplace:plugins:link',
  description: 'Link a local plugin for development',

  handler: {
    async execute(ctx: PluginContextV3, input: LinkInput): Promise<CommandResult<{ id: string; scope: string }>> {
      const pluginPath = input.argv?.[0];
      const flags = (input.flags ?? input) as LinkFlags;

      if (!pluginPath) {
        validationError(ctx, 'Specify a plugin path to link', 'Usage: kb marketplace plugins link <path>', flags.json);
        return { exitCode: 1, result: { id: '', scope: '' } };
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
        return { exitCode: 1, result: { id: '', scope: '' } };
      }

      try {
        // Resolve path against cwd so the daemon always receives an absolute
        // location. Keeps the server side from inheriting any ambient cwd.
        const absPath = path.resolve(ctx.cwd, pluginPath);
        const result = await post<LinkResponse>(`/packages/link`, { path: absPath, ...scopeBody(scopeCtx) });

        if (flags.json) {
          ctx.ui?.json?.({ ok: true, id: result.id, scope: result.scope });
        } else {
          ctx.ui?.success?.(`Linked ${result.id} (${result.scope})`);
        }
        return { exitCode: 0, result: { id: result.id, scope: result.scope } };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1, result: { id: '', scope: '' } };
      }
    },
  },
});
