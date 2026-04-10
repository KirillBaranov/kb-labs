import { defineCommand, useLoader, TimingTracker, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { discoverMonorepos, buildPackageMapFiltered, buildPlan, freeze, loadState } from '@kb-labs/devlink-core';
import type { LockFile } from '@kb-labs/devlink-core';

interface FreezeFlags {
  json?: boolean;
}

interface FreezeInput {
  argv?: string[];
  flags?: FreezeFlags;
  json?: boolean;
}

export default defineCommand<unknown, FreezeInput, LockFile>({
  id: 'devlink:freeze',
  description: 'Freeze current dependency state to lock file',

  handler: {
    async execute(ctx: PluginContextV3, input: FreezeInput): Promise<CommandResult<LockFile>> {
      const tracker = new TimingTracker();
      const flags = (input.flags ?? input) as FreezeFlags;
      const outputJson = flags.json ?? false;

      const rootDir = ctx.cwd ?? process.cwd();

      const loader = useLoader('Freezing current state...');
      loader.start();

      const state = loadState(rootDir);
      const monorepos = discoverMonorepos(rootDir);

      // Build a plan that reflects current state (no-op plan for the current mode)
      const currentMode = state.currentMode ?? 'npm';
      const packageMap = await buildPackageMapFiltered(monorepos, rootDir, undefined, currentMode);
      const plan = buildPlan(currentMode, packageMap, monorepos, rootDir);

      const lock = freeze(rootDir, plan);
      loader.succeed('State frozen');
      tracker.checkpoint('freeze');

      if (outputJson) {
        ctx.ui?.json?.(lock);
      } else {
        ctx.ui?.success?.('Current state frozen to lock file', {
          title: 'DevLink — Freeze',
          sections: [
            {
              header: 'Lock file',
              items: [
                `Mode: ${lock.plan.mode}`,
                `Frozen at: ${lock.frozenAt}`,
                `Location: .kb/devlink/lock.json`,
              ],
            },
          ],
          timing: tracker.total(),
        });
      }

      return { exitCode: 0, result: lock, meta: { timing: tracker.total() } };
    },
  },
});
