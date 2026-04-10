import { defineCommandFlags, combinePermissions, generateExamples } from '@kb-labs/sdk';
import {
  switchFlags,
  statusFlags,
  planFlags,
  freezeFlags,
  undoFlags,
  backupsFlags,
  DEVLINK_CACHE_PREFIX,
} from '@kb-labs/devlink-contracts';

const pluginPermissions = combinePermissions()
  .withFs({
    mode: 'readWrite',
    allow: ['**/package.json', '.kb/devlink/**', '**/pnpm-workspace.yaml'],
  })
  .withPlatform({
    cache: [DEVLINK_CACHE_PREFIX],
  })
  .withQuotas({
    timeoutMs: 1800000, // 30 min — switch --install runs pnpm install in 29 sub-repos
    memoryMb: 512,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/devlink',
  version: '1.0.0',

  display: {
    name: 'DevLink',
    description: 'Manage cross-repo link: ↔ npm dependencies for KB Labs monorepos.',
    tags: ['monorepo', 'devlink', 'dependencies', 'publish', 'local-dev'],
  },

  platform: {
    requires: ['storage'],
    optional: [],
  },

  cli: {
    commands: [
      {
        id: 'devlink:switch',
        group: 'devlink',
        describe: 'Switch all cross-repo deps between link: (local) and npm (CI/CD) mode',
        longDescription:
          'Replaces all cross-repo @kb-labs/* dependencies across monorepos. ' +
          'Creates a backup before applying. Run pnpm install after switching.',

        handler: './cli/commands/switch.js#default',
        handlerPath: './cli/commands/switch.js',

        flags: defineCommandFlags(switchFlags),

        examples: generateExamples('switch', 'devlink', [
          { description: 'Switch to npm mode (CI/CD)', flags: { mode: 'npm' } },
          { description: 'Switch to local mode (development)', flags: { mode: 'local' } },
          { description: 'Preview changes without applying', flags: { mode: 'local', 'dry-run': true } },
          { description: 'Switch specific repos only', flags: { mode: 'npm', repos: 'kb-labs-cli,kb-labs-core' } },
        ]),

        permissions: pluginPermissions,
      },
      {
        id: 'devlink:status',
        group: 'devlink',
        describe: 'Show current state of cross-repo dependencies',
        longDescription:
          'Displays the current linking mode, counts of link: vs npm dependencies, ' +
          'and any discrepancies across all monorepos.',

        handler: './cli/commands/status.js#default',
        handlerPath: './cli/commands/status.js',

        flags: defineCommandFlags(statusFlags),

        examples: generateExamples('status', 'devlink', [
          { description: 'Show summary status', flags: {} },
          { description: 'Verbose output with all deps', flags: { verbose: true } },
          { description: 'JSON output for scripting', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        id: 'devlink:plan',
        group: 'devlink',
        describe: 'Preview what would change when switching mode',
        longDescription:
          'Shows all dependency changes that would be made without applying them. ' +
          'Useful for reviewing before running switch.',

        handler: './cli/commands/plan.js#default',
        handlerPath: './cli/commands/plan.js',

        flags: defineCommandFlags(planFlags),

        examples: generateExamples('plan', 'devlink', [
          { description: 'Plan switch to local mode', flags: { mode: 'local' } },
          { description: 'Plan switch to npm mode', flags: { mode: 'npm' } },
          { description: 'JSON output for scripting', flags: { mode: 'npm', json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        id: 'devlink:freeze',
        group: 'devlink',
        describe: 'Freeze current dependency state to lock file',
        longDescription:
          'Saves a snapshot of current dependency mode to .kb/devlink/lock.json. ' +
          'Use to record a stable known-good state.',

        handler: './cli/commands/freeze.js#default',
        handlerPath: './cli/commands/freeze.js',

        flags: defineCommandFlags(freezeFlags),

        examples: generateExamples('freeze', 'devlink', [
          { description: 'Freeze current state', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        id: 'devlink:undo',
        group: 'devlink',
        describe: 'Restore previous dependency state from last backup',
        longDescription:
          'Restores package.json files from the most recent backup created by switch. ' +
          'Run pnpm install after undoing.',

        handler: './cli/commands/undo.js#default',
        handlerPath: './cli/commands/undo.js',

        flags: defineCommandFlags(undoFlags),

        examples: generateExamples('undo', 'devlink', [
          { description: 'Undo last switch', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        id: 'devlink:backups',
        group: 'devlink',
        describe: 'List and restore backups',
        longDescription:
          'Lists all available backups. Use --restore <id> to restore a specific backup.',

        handler: './cli/commands/backups.js#default',
        handlerPath: './cli/commands/backups.js',

        flags: defineCommandFlags(backupsFlags),

        examples: generateExamples('backups', 'devlink', [
          { description: 'List all backups', flags: {} },
          { description: 'JSON output', flags: { json: true } },
          { description: 'Restore specific backup', flags: { restore: '<backup-id>' } },
        ]),

        permissions: pluginPermissions,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
