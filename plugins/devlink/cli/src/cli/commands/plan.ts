import { defineCommand, useLoader, TimingTracker, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { discoverMonorepos, buildPackageMapFiltered, buildPlan, groupByMonorepo, loadState } from '@kb-labs/devlink-core';
import type { DevlinkMode, DevlinkPlan } from '@kb-labs/devlink-contracts';

interface PlanFlags {
  mode?: DevlinkMode;
  repos?: string;
  json?: boolean;
  ttl?: number;
}

interface PlanInput {
  argv?: string[];
  flags?: PlanFlags;
  mode?: DevlinkMode;
  repos?: string;
  json?: boolean;
}

export default defineCommand<unknown, PlanInput, DevlinkPlan>({
  id: 'devlink:plan',
  description: 'Preview what would change when switching mode',

  handler: {
    async execute(ctx: PluginContextV3, input: PlanInput): Promise<CommandResult<DevlinkPlan>> {
      const tracker = new TimingTracker();
      const flags = (input.flags ?? input) as PlanFlags;
      const outputJson = flags.json ?? false;
      const scopedRepos = flags.repos ? flags.repos.split(',').map(s => s.trim()) : undefined;
      const ttlMs = (flags.ttl ?? 24) * 60 * 60 * 1000;

      const rootDir = ctx.cwd ?? process.cwd();

      const loader = useLoader('Building plan...');
      loader.start();

      const state = loadState(rootDir);
      const monorepos = discoverMonorepos(rootDir);

      // Determine target mode before building package map — local mode skips npm check
      const targetMode: DevlinkMode = flags.mode ?? (state.currentMode === 'npm' ? 'local' : 'npm');
      const packageMap = await buildPackageMapFiltered(monorepos, rootDir, ttlMs, targetMode);

      const plan = buildPlan(targetMode, packageMap, monorepos, rootDir, { scopedRepos });
      loader.succeed(`Plan ready: ${plan.items.length} change(s)`);
      tracker.checkpoint('plan');

      if (outputJson) {
        ctx.ui?.json?.(plan);
      } else {
        if (plan.items.length === 0) {
          ctx.ui?.info?.('No changes needed — already in the target mode.');
        } else {
          const byRepo = groupByMonorepo(plan.items);
          // Unique packages in npm map
          const uniquePkgs = new Set(plan.items.map(i => i.depName)).size;
          const uniqueFiles = new Set(plan.items.map(i => i.packageJsonPath)).size;

          const sections = [...byRepo.entries()].map(([repo, items]) => {
            // Group by depName within each repo — show "×N files" instead of N lines
            const byDep = new Map<string, { from: string; to: string; count: number }>();
            for (const item of items) {
              const existing = byDep.get(item.depName);
              if (existing) {
                existing.count++;
              } else {
                byDep.set(item.depName, { from: item.from, to: item.to, count: 1 });
              }
            }
            return {
              header: `${repo} (${byDep.size} dep${byDep.size !== 1 ? 's' : ''})`,
              items: [...byDep.entries()].map(([dep, { from, to, count }]) =>
                count > 1
                  ? `${dep}: ${from} → ${to}  ×${count} files`
                  : `${dep}: ${from} → ${to}`
              ),
            };
          });

          ctx.ui?.sideBox?.({
            title: 'DevLink — Plan',
            status: 'info',
            summary: {
              'Mode': `${state.currentMode ?? '?'} → ${targetMode}`,
              'Packages': uniquePkgs,
              'Files affected': uniqueFiles,
              'Total changes': plan.items.length,
            },
            sections: [
              ...sections,
              { header: 'Next step', items: [`kb devlink switch --mode=${targetMode}`] },
            ],
            timing: tracker.total(),
          });
        }
      }

      return { exitCode: 0, result: plan, meta: { timing: tracker.total() } };
    },
  },
});
