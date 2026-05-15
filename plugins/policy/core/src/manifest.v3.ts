import { defineCommandFlags, combinePermissions } from '@kb-labs/sdk';

const pluginPermissions = combinePermissions()
  .withFs({
    mode: 'read',
    allow: ['.', '.kb/api-snapshots/**'],
  })
  .withQuotas({
    timeoutMs: 60000,
    memoryMb: 256,
  })
  .build();

const detectPermissions = combinePermissions()
  .withFs({ mode: 'read', allow: ['.'] })
  .withQuotas({ timeoutMs: 15000, memoryMb: 128 })
  .build();

const checkPermissions = combinePermissions()
  .withFs({
    mode: 'read',
    allow: ['.', '.kb/api-snapshots/**'],
  })
  .withFs({
    mode: 'readWrite',
    allow: ['.kb/api-snapshots/**'],
  })
  .withQuotas({ timeoutMs: 60000, memoryMb: 256 })
  .build();

const snapshotPermissions = combinePermissions()
  .withFs({ mode: 'read', allow: ['.'] })
  .withFs({ mode: 'readWrite', allow: ['.kb/api-snapshots/**'] })
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/policy',
  version: '0.1.0',

  configSection: 'policy',

  display: {
    name: 'Policy Enforcer',
    description: 'Enforce workspace development policies',
    tags: ['policy', 'governance', 'boundaries', 'sdk-only', 'api-compat'],
  },

  cli: {
    groupMeta: [
      { path: 'policy', describe: 'Policy enforcement commands' },
    ],
    commands: [
      {
        path: 'policy detect',
        describe: 'Detect policy category for changed or specified repos',
        longDescription:
          'Determines the category for repos based on git changes or a specified path, then resolves applicable policy rules.',

        handler: './cli/commands/detect.js#default',

        flags: defineCommandFlags({
          path: {
            type: 'string',
            description: 'Repo path to check (relative to workspace root). Defaults to git diff.',
          },
          json: {
            type: 'boolean',
            description: 'Output as JSON',
            default: false,
          },
        }),

        permissions: detectPermissions,
      },
      {
        path: 'policy check',
        describe: 'Run policy checks for changed repos or a specific path',
        longDescription:
          'Runs all applicable policy rules for detected repos. Exits with code 1 on violations. Use in CI or pnpm done pipeline.',

        handler: './cli/commands/check.js#default',

        flags: defineCommandFlags({
          path: {
            type: 'string',
            description: 'Repo path to check (relative to workspace root). Defaults to git diff.',
          },
          json: {
            type: 'boolean',
            description: 'Output as JSON',
            default: false,
          },
        }),

        permissions: checkPermissions,
      },
      {
        path: 'policy rules',
        describe: 'Show all configured policy rules and their categories',

        handler: './cli/commands/rules.js#default',

        flags: defineCommandFlags({
          json: {
            type: 'boolean',
            description: 'Output as JSON',
            default: false,
          },
        }),

        permissions: detectPermissions,
      },
      {
        path: 'policy snapshot',
        describe: 'Create or update API snapshot for a repo (run after npm publish)',
        longDescription:
          'Extracts exported symbols from dist/*.d.ts files and saves them to .kb/api-snapshots/. Used by api-compat-check to detect breaking changes.',

        handler: './cli/commands/snapshot.js#default',

        flags: defineCommandFlags({
          path: {
            type: 'string',
            description: 'Repo path (relative to workspace root)',
            required: true,
          },
        }),

        permissions: snapshotPermissions,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
