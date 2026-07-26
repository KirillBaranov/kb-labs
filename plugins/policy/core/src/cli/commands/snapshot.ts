import { defineCommand, findRepoRoot, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { updateSnapshots } from '../../checks/api-compat-check.js';

type SnapshotInput = {
  path: string;
};

export default defineCommand({
  id: 'policy:snapshot',
  description: 'Create or update the API snapshot for packages in a repo. Run after npm publish.',

  handler: {
    async intent(_ctx: PluginContextV3, input: SnapshotInput) {
      const flags = (input as { flags?: SnapshotInput }).flags ?? input;
      const path = flags.path ?? '(unknown)';
      return {
        summary: `Create or update API snapshot for "${path}"`,
        operations: [
          { type: 'create' as const, resource: 'file', details: { path: `.kb/api-snapshots/${path}` } },
        ],
      };
    },

    async execute(ctx: PluginContextV3, input: SnapshotInput): Promise<CommandResult> {
      const flags = (input as { flags?: SnapshotInput }).flags ?? input;

      if (!flags.path) {
        ctx.ui.error('--path is required. Example: pnpm kb policy snapshot --path="platform/kb-labs-sdk"');
        return { ok: false, error: '--path is required' };
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

      return { ok: true };
    },
  },
});
