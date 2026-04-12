import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { del } from '../http.js';

interface UninstallInput {
  argv?: string[];
}

export default defineCommand<unknown, UninstallInput, { removed: string[] }>({
  id: 'marketplace:uninstall',
  description: 'Uninstall package(s) from marketplace',

  handler: {
    async execute(ctx: PluginContextV3, input: UninstallInput): Promise<CommandResult<{ removed: string[] }>> {
      const argv = input.argv ?? [];
      if (argv.length === 0) {
        ctx.ui?.error?.('Please specify at least one package to uninstall');
        return { exitCode: 1, result: { removed: [] } };
      }

      const result = await del<{ ok: boolean; removed: string[] }>('/packages', { packageIds: argv });

      ctx.ui?.success?.(`Removed: ${result.removed.join(', ')}`);
      return { exitCode: 0, result: { removed: result.removed } };
    },
  },
});
