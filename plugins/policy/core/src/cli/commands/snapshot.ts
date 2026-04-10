import { defineCommand, findRepoRoot, type PluginContextV3 } from '@kb-labs/sdk';
import { updateSnapshots } from '../../checks/api-compat-check.js';

type SnapshotInput = {
  path: string;
};

export default defineCommand({
  id: 'policy:snapshot',
  description: 'Create or update the API snapshot for packages in a repo. Run after npm publish.',

  handler: {
    async execute(ctx: PluginContextV3, input: SnapshotInput): Promise<{ exitCode: number }> {
      const flags = (input as { flags?: SnapshotInput }).flags ?? input;

      if (!flags.path) {
        ctx.ui.error('--path is required. Example: pnpm kb policy snapshot --path="platform/kb-labs-sdk"');
        return { exitCode: 1 };
      }

      const workspaceRoot = (await findRepoRoot(ctx.cwd)) ?? ctx.cwd;

      ctx.ui.info?.(`Extracting API snapshot for ${flags.path}...`);
      updateSnapshots(flags.path, workspaceRoot);
      ctx.ui.success?.('Snapshot updated', {
        sections: [
          {
            header: 'Info',
            items: [
              `Path: ${flags.path}`,
              `Snapshots saved to: .kb/api-snapshots/`,
            ],
          },
        ],
      });

      return { exitCode: 0 };
    },
  },
});
