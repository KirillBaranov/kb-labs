import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
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
      if (!pluginPath) {
        ctx.ui?.error?.('Specify a plugin path to link');
        return { exitCode: 1, result: { id: '', scope: '' } };
      }
      const flags = (input.flags ?? input) as LinkFlags;

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(ctx.cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { id: '', scope: '' } };
        }
        throw err;
      }

      // Resolve path against cwd so the daemon always receives an absolute
      // location. Keeps the server side from inheriting any ambient cwd.
      const absPath = path.resolve(ctx.cwd, pluginPath);

      const result = await post<LinkResponse>(
        `/packages/link`,
        { path: absPath, ...scopeBody(scopeCtx) },
      );

      ctx.ui?.success?.(`Linked ${result.id} (${result.scope})`);
      return { exitCode: 0, result: { id: result.id, scope: result.scope } };
    },
  },
});
