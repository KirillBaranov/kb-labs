import { cmd, group, mergeCliGroups, combinePermissions, generateExamples } from '@kb-labs/sdk';
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
    timeoutMs: 1800000,
    memoryMb: 512,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/devlink',
  version: '1.0.0',

  display: {
    name: 'DevLink',
    description: 'Cross-repo link: dependency management',
    tags: ['monorepo', 'devlink', 'dependencies', 'publish', 'local-dev'],
  },

  platform: {
    requires: ['storage'],
    optional: [],
  },

  cli: mergeCliGroups(
    group({ path: 'devlink', describe: 'Cross-repo link: dependency management' }, [
      cmd('devlink switch', './cli/commands/switch.js#default', 'Switch deps between local link: and npm (CI/CD) mode')
        .mutate()
        .category('Mode')
        .long(
          'Replaces all cross-repo @kb-labs/* dependencies across monorepos. ' +
          'Creates a backup before applying. Run pnpm install after switching.',
        )
        .flags(switchFlags)
        .examples(generateExamples('switch', 'devlink', [
          { description: 'Switch to npm mode (CI/CD)', flags: { mode: 'npm' } },
          { description: 'Switch to local mode (development)', flags: { mode: 'local' } },
          { description: 'Preview changes without applying', flags: { mode: 'local', 'dry-run': true } },
          { description: 'Switch specific repos only', flags: { mode: 'npm', repos: 'kb-labs-cli,kb-labs-core' } },
        ])),

      cmd('devlink status', './cli/commands/status.js#default', 'Show current state of cross-repo dependencies')
        .read()
        .category('Mode')
        .long(
          'Displays the current linking mode, counts of link: vs npm dependencies, ' +
          'and any discrepancies across all monorepos.',
        )
        .flags(statusFlags)
        .examples(generateExamples('status', 'devlink', [
          { description: 'Show summary status', flags: {} },
          { description: 'Verbose output with all deps', flags: { verbose: true } },
          { description: 'JSON output for scripting', flags: { json: true } },
        ])),

      cmd('devlink plan', './cli/commands/plan.js#default', 'Preview what would change when switching mode')
        .read()
        .category('Mode')
        .long(
          'Shows all dependency changes that would be made without applying them. ' +
          'Useful for reviewing before running switch.',
        )
        .flags(planFlags)
        .examples(generateExamples('plan', 'devlink', [
          { description: 'Plan switch to local mode', flags: { mode: 'local' } },
          { description: 'Plan switch to npm mode', flags: { mode: 'npm' } },
          { description: 'JSON output for scripting', flags: { mode: 'npm', json: true } },
        ])),

      cmd('devlink freeze', './cli/commands/freeze.js#default', 'Freeze current dependency state to lock file')
        .mutate()
        .category('State')
        .long(
          'Saves a snapshot of current dependency mode to .kb/devlink/lock.json. ' +
          'Use to record a stable known-good state.',
        )
        .flags(freezeFlags)
        .examples(generateExamples('freeze', 'devlink', [
          { description: 'Freeze current state', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ])),

      cmd('devlink undo', './cli/commands/undo.js#default', 'Restore previous dependency state from last backup')
        .mutate()
        .category('State')
        .long(
          'Restores package.json files from the most recent backup created by switch. ' +
          'Run pnpm install after undoing.',
        )
        .flags(undoFlags)
        .examples(generateExamples('undo', 'devlink', [
          { description: 'Undo last switch', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ])),

      cmd('devlink backups', './cli/commands/backups.js#default', 'List and restore backups')
        .read()
        .category('State')
        .long('Lists all available backups. Use --restore <id> to restore a specific backup.')
        .flags(backupsFlags)
        .examples(generateExamples('backups', 'devlink', [
          { description: 'List all backups', flags: {} },
          { description: 'JSON output', flags: { json: true } },
          { description: 'Restore specific backup', flags: { restore: '<backup-id>' } },
        ])),
    ]),
  ),

  permissions: pluginPermissions,
};

export default manifest;
