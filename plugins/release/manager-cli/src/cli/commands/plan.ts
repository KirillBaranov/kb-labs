/**
 * Release plan command
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
  useLoader,
  displayArtifacts,
  type ArtifactInfo,
  useConfig,
} from '@kb-labs/sdk';
import { planRelease, type VersionBump, type ReleaseConfig } from '@kb-labs/release-manager-core';
import { findRepoRoot, scopeToDir } from '../../shared/utils';

interface PlanFlags {
  scope?: string;
  flow?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  strict?: boolean;
  json?: boolean;
}

type ReleasePlanResult = CommandResult & {
  plan?: {
    strategy: string;
    registry: string;
    packages: Array<{
      name: string;
      currentVersion?: string;
      nextVersion?: string;
    }>;
  };
};

export default defineCommand({
  id: 'release:plan',
  description: 'Analyze changes and prepare release plan',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PlanFlags>): Promise<ReleasePlanResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      // Load configuration
      const configLoader = useLoader('Loading release configuration...');
      configLoader.start();

      const fileConfig = await useConfig<ReleaseConfig>();

      // Merge CLI overrides
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
        ...(flags.strict !== undefined && { strict: flags.strict }),
      };

      configLoader.succeed('Configuration loaded');

      // Create release plan
      const planLoader = useLoader('Discovering packages and planning release...');
      planLoader.start();

      const plan = await planRelease({
        cwd: repoRoot,
        config,
        scope: flags.scope,
        flow: flags.flow,
        bumpOverride: flags.bump as VersionBump | undefined,
      });

      if (plan.packages.length === 0) {
        planLoader.fail(`No packages found matching scope: ${flags.scope || 'all'}`);
      } else {
        planLoader.succeed(`Found ${plan.packages.length} package(s) to release`);
      }

      // Save plan to .kb/release/plans/{scope}/current/plan.json
      const scopeDir = scopeToDir(flags.scope ?? 'root');
      const planDir = ctx.runtime.fs.join(repoRoot, '.kb', 'release', 'plans', scopeDir, 'current');
      const planPath = ctx.runtime.fs.join(planDir, 'plan.json');
      const artifacts: ArtifactInfo[] = [];

      if (!flags.json) {
        await ctx.runtime.fs.mkdir(planDir, { recursive: true });
        await ctx.runtime.fs.writeFile(planPath, JSON.stringify(plan, null, 2), { encoding: 'utf-8' });

        const stats = await ctx.runtime.fs.stat(planPath);
        artifacts.push({
          name: 'Release Plan',
          path: planPath,
          size: stats.size,
          modified: new Date(stats.mtime),
          description: 'Detailed release plan (JSON)',
        });
      }

      ctx.platform?.logger?.info?.('Release plan completed', {
        packagesCount: plan.packages.length,
        strategy: plan.strategy,
        registry: plan.registry,
      });

      if (flags.json) {
        ctx.ui?.json?.(plan);
      } else {
        const sections: Array<{ header?: string; items: string[] }> = [];

        // Summary
        sections.push({
          header: 'Summary',
          items: [
            `Strategy: ${plan.strategy}`,
            `Registry: ${plan.registry}`,
            `Packages: ${plan.packages.length}`,
          ],
        });

        // Packages section
        if (plan.packages.length > 0) {
          const packageItems: string[] = [];
          for (const pkg of plan.packages) {
            const versionInfo =
              pkg.currentVersion && pkg.nextVersion
                ? `${pkg.currentVersion} → ${pkg.nextVersion}`
                : pkg.nextVersion || 'new';
            packageItems.push(`${ctx.ui.symbols.success} ${pkg.name}: ${versionInfo}`);
          }
          sections.push({
            header: 'Packages to release',
            items: packageItems,
          });
        } else {
          sections.push({
            items: ['No packages to release'],
          });
        }

        // Artifacts section
        if (artifacts.length > 0) {
          const artifactsLines = displayArtifacts(artifacts, {
            showSize: true,
            showTime: true,
            showDescription: true,
            maxItems: 10,
            title: '',
          });
          sections.push({
            header: 'Artifacts',
            items: artifactsLines,
          });
        }

        ctx.ui.sideBox({
          title: 'Release Plan',
          sections,
          status: 'success',
        });
      }

      return { exitCode: 0, plan };
    },
  },
});
