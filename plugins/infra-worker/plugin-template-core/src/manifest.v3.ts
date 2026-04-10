import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import { defineCommandFlags } from '@kb-labs/sdk';

export const manifest: ManifestV3 = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/infra-worker',
  version: '0.1.0',
  display: {
    name: 'Infra Worker',
    description: 'Provision infra capabilities and return stable IDs for orchestrators.',
    tags: ['infra', 'workspace', 'environment', 'snapshot'],
  },
  permissions: {
    platform: {
      environment: {
        create: true,
        read: true,
        destroy: true,
        renewLease: true,
        templates: ['*'],
      },
      workspace: {
        materialize: true,
        attach: true,
        release: true,
        read: true,
        sources: ['*'],
        paths: ['*'],
      },
      snapshot: {
        capture: true,
        restore: true,
        delete: true,
        read: true,
        garbageCollect: true,
        namespaces: ['*'],
      },
    },
  },
  cli: {
    commands: [
      {
        id: 'infra-worker:prepare',
        group: 'infra-worker',
        describe: 'Materialize workspace, optional environment, and optional snapshot.',
        handler: './cli/commands/prepare-infra.js#default',
        handlerPath: './cli/commands/prepare-infra.js',
        flags: defineCommandFlags({
          sourceRef: { type: 'string', description: 'Workspace source reference (repo/branch/etc)' },
          basePath: { type: 'string', description: 'Workspace base path' },
          createEnvironment: { type: 'boolean', default: false, description: 'Provision environment after workspace materialize' },
          templateId: { type: 'string', description: 'Environment template ID' },
          ttlMs: { type: 'number', description: 'Environment lease TTL in milliseconds' },
          captureSnapshot: { type: 'boolean', default: false, description: 'Capture snapshot after prepare' },
          namespace: { type: 'string', description: 'Snapshot namespace' },
        }),
      },
      {
        id: 'infra-worker:capture-snapshot',
        group: 'infra-worker',
        describe: 'Capture snapshot for workspace/environment.',
        handler: './cli/commands/capture-snapshot.js#default',
        handlerPath: './cli/commands/capture-snapshot.js',
        flags: defineCommandFlags({
          workspaceId: { type: 'string', description: 'Workspace ID' },
          environmentId: { type: 'string', description: 'Environment ID' },
          namespace: { type: 'string', description: 'Snapshot namespace' },
          sourcePath: { type: 'string', description: 'Source path for snapshot' },
        }),
      },
      {
        id: 'infra-worker:restore-snapshot',
        group: 'infra-worker',
        describe: 'Restore snapshot to workspace/environment target.',
        handler: './cli/commands/restore-snapshot.js#default',
        handlerPath: './cli/commands/restore-snapshot.js',
        flags: defineCommandFlags({
          snapshotId: { type: 'string', required: true, description: 'Snapshot ID to restore' },
          workspaceId: { type: 'string', description: 'Workspace ID target' },
          environmentId: { type: 'string', description: 'Environment ID target' },
          targetPath: { type: 'string', description: 'Restore target path' },
          overwrite: { type: 'boolean', default: false, description: 'Overwrite existing files' },
        }),
      },
    ],
  },
};

export default manifest;
