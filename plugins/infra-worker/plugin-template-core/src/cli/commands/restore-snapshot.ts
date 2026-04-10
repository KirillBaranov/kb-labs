import { defineCommand, type CommandResult, type PluginContextV3 } from '@kb-labs/sdk';

interface RestoreSnapshotFlags {
  snapshotId?: string;
  workspaceId?: string;
  environmentId?: string;
  targetPath?: string;
  overwrite?: boolean;
}

interface RestoreSnapshotInput {
  argv: string[];
  flags: RestoreSnapshotFlags;
}

interface RestoreSnapshotResult {
  snapshotId: string;
  restoredAt: string;
}

export default defineCommand<unknown, RestoreSnapshotInput, RestoreSnapshotResult>({
  id: 'infra-worker:restore-snapshot',
  description: 'Restore snapshot to workspace/environment.',
  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: RestoreSnapshotInput
    ): Promise<CommandResult<RestoreSnapshotResult>> {
      const flags = input.flags;
      if (!flags.snapshotId) {
        throw new Error('Missing required flag: snapshotId');
      }

      const restored = await ctx.api.snapshot.restore({
        snapshotId: flags.snapshotId,
        workspaceId: flags.workspaceId,
        environmentId: flags.environmentId,
        targetPath: flags.targetPath,
        overwrite: flags.overwrite,
      });

      const result: RestoreSnapshotResult = {
        snapshotId: restored.snapshotId,
        restoredAt: restored.restoredAt,
      };
      ctx.ui.success(`Snapshot restored: ${result.snapshotId}`);

      return {
        exitCode: 0,
        result,
      };
    },
  },
});
