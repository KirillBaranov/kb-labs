/**
 * Release rollback command
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3 } from '@kb-labs/sdk';
import { restoreSnapshot } from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface RollbackFlags {
  json?: boolean;
}

type ReleaseRollbackResult = CommandResult & {
  message?: string;
};

export default defineCommand({
  id: 'release:rollback',
  description: 'Rollback last release',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RollbackFlags>): Promise<ReleaseRollbackResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      await restoreSnapshot(repoRoot);

      ctx.platform?.logger?.info?.('Release rollback completed');

      if (flags.json) {
        ctx.ui?.json?.({ exitCode: 4, message: 'Rollback completed' });
      } else {
        ctx.ui.sideBox({
          title: 'Rollback',
          sections: [
            {
              items: [
                `${ctx.ui.symbols.success} ${ctx.ui.colors.success('Release state restored from backup snapshot')}`,
              ],
            },
          ],
          status: 'success',
        });
      }

      // Return exit code 4 for rollback executed
      return { exitCode: 4, message: 'Rollback completed' };
    },
  },
});
