/**
 * Release git command — commit, tag, and push release changes.
 * Atomic step: reads plan, runs git ops, emits output marker for workflow.
 */

import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
import {
  planRelease,
  commitAndTagRelease,
  resolveScopePath,
  type ReleaseConfig,
  type VersionBump,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface GitFlags {
  scope?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  'dry-run'?: boolean;
  'no-verify'?: boolean;
  json?: boolean;
}

type ReleaseGitResult = CommandResult & {
  committed?: boolean;
  tagged?: string[];
  pushed?: boolean;
};

function buildGitSections(
  result: { committed: boolean; tagged: string[]; pushed: boolean },
  dryRun: boolean,
  symbols: { success: string; warning: string },
): Array<{ header?: string; items: string[] }> {
  if (dryRun) {
    return [{ items: [`${symbols.warning} Dry-run: no git operations performed`] }];
  }

  return [
    {
      header: 'Git Operations',
      items: [
        `${result.committed ? symbols.success : symbols.warning} Commit: ${result.committed ? 'created' : 'skipped'}`,
        `${result.tagged.length > 0 ? symbols.success : symbols.warning} Tags: ${result.tagged.length > 0 ? result.tagged.join(', ') : 'none'}`,
        `${result.pushed ? symbols.success : symbols.warning} Push: ${result.pushed ? 'done' : 'skipped'}`,
      ],
    },
  ];
}

export default defineCommand({
  id: 'release:git',
  description: 'Commit, tag, and push release changes',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<GitFlags>): Promise<ReleaseGitResult> {
      const { flags } = input;
      const dryRun = flags['dry-run'] ?? false;
      const noVerify = flags['no-verify'] ?? false;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
      };

      const planLoader = useLoader('Loading release plan...');
      planLoader.start();
      const plan = await planRelease({
        cwd: repoRoot,
        config,
        scope: flags.scope,
        bumpOverride: flags.bump as VersionBump | undefined,
      });
      planLoader.succeed(`Loaded plan: ${plan.packages.length} package(s)`);

      if (plan.packages.length === 0) {
        const msg = `No packages found${flags.scope ? ` matching scope: ${flags.scope}` : ''}`;
        if (flags.json) { ctx.ui?.json?.({ committed: false, tagged: [], pushed: false, message: msg }); }
        else { ctx.ui?.write?.(msg); }
        console.log('::kb-output::' + JSON.stringify({ committed: false, tagged: [], pushed: false }));
        return { exitCode: 0, committed: false, tagged: [], pushed: false };
      }

      const scopePath = await resolveScopePath(repoRoot, flags.scope ?? 'root');

      const gitLoader = useLoader(dryRun ? 'Dry-run: skipping git operations' : 'Committing, tagging, pushing...');
      gitLoader.start();

      const result = await commitAndTagRelease({
        cwd: scopePath,
        plan,
        dryRun,
        noVerify,
      });

      if (dryRun) {
        gitLoader.succeed('Dry-run: no git operations performed');
      } else if (result.pushed) {
        gitLoader.succeed(`Committed, tagged (${result.tagged.length}), pushed`);
      } else {
        gitLoader.succeed(`Committed, tagged (${result.tagged.length})`);
      }

      console.log('::kb-output::' + JSON.stringify({
        committed: result.committed,
        tagged: result.tagged,
        pushed: result.pushed,
      }));

      if (flags.json) {
        ctx.ui?.json?.(result);
        return { exitCode: 0, ...result };
      }

      ctx.ui.sideBox({
        title: dryRun ? 'Git (dry-run)' : 'Git Operations',
        sections: buildGitSections(result, dryRun, ctx.ui.symbols),
        status: 'success',
      });

      return { exitCode: 0, ...result };
    },
  },
});
