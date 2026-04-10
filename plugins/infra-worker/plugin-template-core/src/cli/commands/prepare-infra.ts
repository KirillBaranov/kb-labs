import { defineCommand, type CommandResult, type PluginContextV3 } from '@kb-labs/sdk';

interface PrepareInfraFlags {
  sourceRef?: string;
  basePath?: string;
  createEnvironment?: boolean;
  templateId?: string;
  ttlMs?: number;
  captureSnapshot?: boolean;
  namespace?: string;
}

interface PrepareInfraInput {
  argv: string[];
  flags: PrepareInfraFlags;
}

interface PrepareInfraResult {
  workspaceId: string;
  environmentId?: string;
  snapshotId?: string;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {return true;}
    if (normalized === 'false') {return false;}
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {return parsed;}
  }
  return undefined;
}

export default defineCommand<unknown, PrepareInfraInput, PrepareInfraResult>({
  id: 'infra-worker:prepare',
  description: 'Materialize workspace, optionally provision environment, optionally capture snapshot.',
  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: PrepareInfraInput
    ): Promise<CommandResult<PrepareInfraResult>> {
      const flags = input.flags;
      const createEnvironment = toBoolean(flags.createEnvironment) ?? false;
      const captureSnapshot = toBoolean(flags.captureSnapshot) ?? false;
      const ttlMs = toNumber(flags.ttlMs);

      const workspace = await ctx.api.workspace.materialize({
        sourceRef: flags.sourceRef,
        basePath: flags.basePath,
      });

      let environmentId: string | undefined;
      if (createEnvironment) {
        const environment = await ctx.api.environment.create({
          templateId: flags.templateId,
          ttlMs,
          workspacePath: workspace.rootPath ?? flags.basePath,
        });
        environmentId = environment.environmentId;
        await ctx.api.workspace.attach({
          workspaceId: workspace.workspaceId,
          environmentId,
        });
      }

      let snapshotId: string | undefined;
      if (captureSnapshot) {
        const snapshot = await ctx.api.snapshot.capture({
          workspaceId: workspace.workspaceId,
          environmentId,
          namespace: flags.namespace,
        });
        snapshotId = snapshot.snapshotId;
      }

      const result: PrepareInfraResult = {
        workspaceId: workspace.workspaceId,
        environmentId,
        snapshotId,
      };

      ctx.ui.success('Infrastructure prepared', {
        sections: [
          {
            header: 'Identifiers',
            items: [
              `workspaceId: ${result.workspaceId}`,
              `environmentId: ${result.environmentId ?? '-'}`,
              `snapshotId: ${result.snapshotId ?? '-'}`,
            ],
          },
        ],
      });

      return {
        exitCode: 0,
        result,
      };
    },
  },
});
