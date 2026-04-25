/**
 * Release version command — bump versions in package.json files.
 * Atomic step: reads plan, updates package.json versions, emits output marker for workflow.
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
import {
  planRelease,
  updatePackageVersions,
  type ReleaseConfig,
  type VersionBump,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface VersionFlags {
  scope?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  'dry-run'?: boolean;
  json?: boolean;
}

type ReleaseVersionResult = CommandResult & {
  ok?: boolean;
  updated?: number;
  updates?: Array<{ package: string; from: string; to: string; updated: boolean }>;
};

function buildVersionSections(
  updates: Array<{ package: string; from: string; to: string; updated: boolean }>,
  dryRun: boolean,
  symbols: { success: string; error: string },
): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [];

  if (dryRun) {
    sections.push({
      header: 'Would update (dry-run)',
      items: updates.map(u => `${symbols.success} ${u.package}: ${u.from} → ${u.to}`),
    });
    return sections;
  }

  const succeeded = updates.filter(u => u.updated);
  const failed = updates.filter(u => !u.updated);

  if (succeeded.length > 0) {
    sections.push({
      header: 'Updated',
      items: succeeded.map(u => `${symbols.success} ${u.package}: ${u.from} → ${u.to}`),
    });
  }

  if (failed.length > 0) {
    sections.push({
      header: 'Failed',
      items: failed.map(u => `${symbols.error} ${u.package}: ${u.from} → ${u.to}`),
    });
  }

  return sections;
}

export default defineCommand({
  id: 'release:version',
  description: 'Bump package.json versions according to release plan',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<VersionFlags>): Promise<ReleaseVersionResult> {
      const { flags } = input;
      const dryRun = flags['dry-run'] ?? false;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
      };

      const planLoader = useLoader('Planning version bumps...');
      planLoader.start();
      const plan = await planRelease({
        cwd: repoRoot,
        config,
        scope: flags.scope,
        bumpOverride: flags.bump as VersionBump | undefined,
      });
      planLoader.succeed(`Planned ${plan.packages.length} package(s)`);

      if (plan.packages.length === 0) {
        const msg = `No packages found${flags.scope ? ` matching scope: ${flags.scope}` : ''}`;
        if (flags.json) { ctx.ui?.json?.({ ok: true, updated: 0, updates: [], message: msg }); }
        else { ctx.ui?.write?.(msg); }
        console.log('::kb-output::' + JSON.stringify({ ok: true, updated: 0 }));
        return { exitCode: 0, ok: true, updated: 0, updates: [] };
      }

      if (dryRun) {
        const dryUpdates = plan.packages.map(p => ({
          package: p.name,
          from: p.currentVersion || 'unknown',
          to: p.nextVersion || 'unknown',
          updated: false,
        }));
        console.log('::kb-output::' + JSON.stringify({ ok: true, updated: 0 }));
        if (flags.json) {
          ctx.ui?.json?.({ ok: true, updated: 0, updates: dryUpdates, dryRun: true });
          return { exitCode: 0, ok: true, updated: 0, updates: dryUpdates };
        }
        ctx.ui.sideBox({
          title: 'Version Bump (dry-run)',
          sections: buildVersionSections(dryUpdates, true, ctx.ui.symbols),
          status: 'success',
        });
        return { exitCode: 0, ok: true, updated: 0, updates: dryUpdates };
      }

      const versionLoader = useLoader(`Bumping ${plan.packages.length} package version(s)...`);
      versionLoader.start();

      const updates = await updatePackageVersions(plan);
      const updated = updates.filter(u => u.updated).length;
      const ok = updates.every(u => u.updated);

      if (ok) {
        versionLoader.succeed(`Bumped ${updated} package version(s)`);
      } else {
        versionLoader.fail(`${updates.filter(u => !u.updated).length} update(s) failed`);
      }

      console.log('::kb-output::' + JSON.stringify({ ok, updated }));

      if (flags.json) {
        ctx.ui?.json?.({ ok, updated, updates });
        return { exitCode: ok ? 0 : 1, ok, updated, updates };
      }

      ctx.ui.sideBox({
        title: 'Version Bump',
        sections: buildVersionSections(updates, false, ctx.ui.symbols),
        status: ok ? 'success' : 'error',
      });

      return { exitCode: ok ? 0 : 1, ok, updated, updates };
    },
  },
});
