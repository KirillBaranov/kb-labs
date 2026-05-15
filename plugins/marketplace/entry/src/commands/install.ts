import { defineCommand, validationError, handleError, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../scope.js';

interface InstallFlags {
  dev?: boolean;
  json?: boolean;
  scope?: string;
}

interface InstallInput {
  argv?: string[];
  flags?: InstallFlags;
}

interface InstalledEntry {
  id: string;
  version: string;
  primaryKind: string;
}

interface InstallResultData {
  installed: InstalledEntry[];
  warnings: string[];
  scope: string;
}

export default defineCommand<unknown, InstallInput, InstallResultData>({
  id: 'marketplace:install',
  description: 'Install package(s) from marketplace',

  handler: {
    async execute(ctx: PluginContextV3, input: InstallInput): Promise<CommandResult<InstallResultData>> {
      const argv = input.argv ?? [];
      const flags = (input.flags ?? input) as InstallFlags;

      if (argv.length === 0) {
        validationError(ctx, 'Please specify at least one package to install', 'Usage: kb marketplace install <package>', flags.json);
        return { exitCode: 1, result: { installed: [], warnings: [], scope: '' } };
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
        return { exitCode: 1, result: { installed: [], warnings: [], scope: '' } };
      }

      try {
        const result = await post<InstallResultData>('/packages/install', {
          specs: argv,
          dev: Boolean(flags.dev),
          ...scopeBody(scopeCtx),
        });

        if (flags.json) {
          ctx.ui?.json?.(result);
        } else {
          ctx.ui?.success?.(`Marketplace install completed (${result.scope ?? scopeCtx.scope})`, {
            sections: [
              {
                header: 'Installed',
                items: result.installed.map(p => `${p.id}@${p.version} (${p.primaryKind})`),
              },
              ...(result.warnings.length > 0
                ? [{ header: 'Warnings', items: result.warnings }]
                : []),
            ],
          });
        }

        return { exitCode: 0, result };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1, result: { installed: [], warnings: [], scope: '' } };
      }
    },
  },
});
