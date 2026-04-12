import { defineCommand, useLoader, TimingTracker, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { getLastBackup, restoreBackup, saveState, loadState } from '@kb-labs/devlink-core';

interface UndoFlags {
  json?: boolean;
}

interface UndoInput {
  argv?: string[];
  flags?: UndoFlags;
  json?: boolean;
}

interface UndoResult {
  restored: number;
  backupId: string;
  errors: string[];
}

export default defineCommand<unknown, UndoInput, UndoResult>({
  id: 'devlink:undo',
  description: 'Restore previous dependency state from last backup',

  handler: {
    async execute(ctx: PluginContextV3, input: UndoInput): Promise<CommandResult<UndoResult>> {
      const tracker = new TimingTracker();
      const flags = (input.flags ?? input) as UndoFlags;
      const outputJson = flags.json ?? false;

      const rootDir = ctx.cwd ?? process.cwd();

      const backup = getLastBackup(rootDir);
      if (!backup) {
        ctx.ui?.error?.('No backups found. Run switch first to create a backup.');
        return { exitCode: 1 };
      }

      const loader = useLoader(`Restoring from backup ${backup.id}...`);
      loader.start();

      const { restored, errors } = restoreBackup(rootDir, backup.id);
      loader.succeed(`Restored ${restored} file(s)`);
      tracker.checkpoint('restore');

      // Update state to backup's previous mode
      const currentState = loadState(rootDir);
      saveState(rootDir, {
        ...currentState,
        currentMode: backup.modeAtBackup,
        lastApplied: new Date().toISOString(),
      });

      const result: UndoResult = { restored, backupId: backup.id, errors };

      if (outputJson) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.success?.(`Restored from backup (mode: ${backup.modeAtBackup ?? 'unknown'})`, {
          title: 'DevLink — Undo',
          sections: [
            {
              header: 'Summary',
              items: [
                `Backup ID: ${backup.id}`,
                `Created: ${backup.timestamp}`,
                `Restored files: ${restored}`,
              ],
            },
            ...(errors.length > 0 ? [{ header: 'Errors', items: errors }] : []),
            { header: 'Next step', items: ['Run pnpm install to apply changes'] },
          ],
          timing: tracker.total(),
        });
      }

      return { exitCode: errors.length > 0 ? 1 : 0, result, meta: { timing: tracker.total() } };
    },
  },
});
