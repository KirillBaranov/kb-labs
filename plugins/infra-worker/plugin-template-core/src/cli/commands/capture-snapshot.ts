import { defineCommand, type CommandResult, type PluginContextV3 } from '@kb-labs/sdk';

interface CaptureSnapshotFlags {
  workspaceId?: string;
  environmentId?: string;
  namespace?: string;
  sourcePath?: string;
}

interface CaptureSnapshotInput {
  argv: string[];
  flags: CaptureSnapshotFlags;
}

interface CaptureSnapshotResult {
  snapshotId: string;
}

export default defineCommand<unknown, CaptureSnapshotInput, CaptureSnapshotResult>({
  id: 'infra-worker:capture-snapshot',
  description: 'Capture snapshot from workspace/environment.',
  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: CaptureSnapshotInput
    ): Promise<CommandResult<CaptureSnapshotResult>> {
      const flags = input.flags;
      const snapshot = await ctx.api.snapshot.capture({
        workspaceId: flags.workspaceId,
        environmentId: flags.environmentId,
        namespace: flags.namespace,
        sourcePath: flags.sourcePath,
      });

      const result: CaptureSnapshotResult = { snapshotId: snapshot.snapshotId };
      ctx.ui.success(`Snapshot captured: ${result.snapshotId}`);

      return {
        exitCode: 0,
        result,
      };
    },
  },
});
