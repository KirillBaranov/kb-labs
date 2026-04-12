import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';

interface InstallFlags {
  dev?: boolean;
  json?: boolean;
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
}

export default defineCommand<unknown, InstallInput, InstallResultData>({
  id: 'marketplace:install',
  description: 'Install package(s) from marketplace',

  handler: {
    async execute(ctx: PluginContextV3, input: InstallInput): Promise<CommandResult<InstallResultData>> {
      const argv = input.argv ?? [];
      const flags = (input.flags ?? input) as InstallFlags;

      if (argv.length === 0) {
        ctx.ui?.error?.('Please specify at least one package to install');
        return { exitCode: 1, result: { installed: [], warnings: [] } };
      }

      const result = await post<InstallResultData>('/packages', {
        specs: argv,
        dev: Boolean(flags.dev),
      });

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.success?.('Marketplace install completed', {
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
    },
  },
});
