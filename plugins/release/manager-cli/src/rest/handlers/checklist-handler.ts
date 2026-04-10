/**
 * Checklist handler - Get unified release checklist status
 *
 * Returns status of all release steps: plan, changelog, build, preview
 */

import { defineHandler, findRepoRoot, type RestInput } from '@kb-labs/sdk';
import type {
  ReleaseChecklist,
  ChecklistItemStatus,
  ReleasePlan,
} from '@kb-labs/release-manager-contracts';
import { readFile, access, readdir, stat } from 'node:fs/promises';
import { scopeToDir } from '../../shared/utils';
import { join } from 'node:path';

interface ChecklistInput {
  scope?: string;
}

export default defineHandler({
  async execute(ctx, input: RestInput<ChecklistInput>): Promise<ReleaseChecklist> {
    const scope = input.query?.scope || 'root';
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);

    const scopeDir = scopeToDir(scope);
    const basePath = join(repoRoot, '.kb/release/plans', scopeDir, 'current');

    // Check plan status
    let planStatus: ChecklistItemStatus = 'pending';
    let planMessage = 'No release plan found';
    let packagesCount = 0;
    let bump: string | undefined;
    let plan: ReleasePlan | undefined;

    try {
      const planRaw = await readFile(join(basePath, 'plan.json'), 'utf-8');
      const parsedPlan: ReleasePlan = JSON.parse(planRaw);
      plan = parsedPlan;
      packagesCount = parsedPlan.packages.length;
      // Get bump type from first package (simplified)
      bump = parsedPlan.packages[0]?.bump;
      planStatus = 'ready';
      planMessage = `${packagesCount} package${packagesCount !== 1 ? 's' : ''}, ${bump} bump`;
    } catch {
      // No plan
    }

    // Check changelog status
    let changelogStatus: ChecklistItemStatus = 'pending';
    let changelogMessage = 'Changelog not generated';
    let commitsCount: number | undefined;

    try {
      const changelogPath = join(basePath, 'CHANGELOG.md');
      await access(changelogPath);
      const changelog = await readFile(changelogPath, 'utf-8');
      // Count commits by looking for commit-like patterns
      const commitMatches = changelog.match(/^- /gm);
      commitsCount = commitMatches?.length || 0;
      changelogStatus = 'ready';
      changelogMessage = `${commitsCount} change${commitsCount !== 1 ? 's' : ''} documented`;
    } catch {
      if (planStatus === 'ready') {
        changelogMessage = 'Generate changelog to continue';
      }
    }

    // Check build status
    let buildStatus: ChecklistItemStatus = 'pending';
    let buildMessage = 'Build required';
    let builtCount = 0;
    let totalCount = 0;

    if (plan) {
      totalCount = plan.packages.length;
      for (const pkg of plan.packages) {
        const packagePath = pkg.path.startsWith('/') ? pkg.path : join(repoRoot, pkg.path);
        try {
          await access(join(packagePath, 'dist'));
          builtCount++;
        } catch {
          // Not built
        }
      }

      if (builtCount === totalCount) {
        buildStatus = 'ready';
        buildMessage = `All ${totalCount} package${totalCount !== 1 ? 's' : ''} built`;
      } else if (builtCount > 0) {
        buildStatus = 'warning';
        buildMessage = `${builtCount}/${totalCount} packages built`;
      } else {
        buildMessage = `${totalCount} package${totalCount !== 1 ? 's' : ''} need build`;
      }
    }

    // Check preview status
    let previewStatus: ChecklistItemStatus = 'pending';
    let previewMessage = 'Waiting for build';
    let filesCount: number | undefined;
    let totalSize: number | undefined;

    if (buildStatus === 'ready' && plan) {
      filesCount = 0;
      totalSize = 0;

      for (const pkg of plan.packages) {
        const packagePath = pkg.path.startsWith('/') ? pkg.path : join(repoRoot, pkg.path);
        try {
          // Count files in dist folder recursively
          const distPath = join(packagePath, 'dist');
          const countFiles = async (dir: string): Promise<{ count: number; size: number }> => {
            let count = 0;
            let size = 0;
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = join(dir, entry.name);
              if (entry.isDirectory()) {
                const sub = await countFiles(fullPath);
                count += sub.count;
                size += sub.size;
              } else {
                count++;
                const fileStat = await stat(fullPath);
                size += fileStat.size;
              }
            }
            return { count, size };
          };
          const result = await countFiles(distPath);
          filesCount += result.count;
          totalSize += result.size;
        } catch {
          // Skip - dist doesn't exist or error reading
        }
      }

      if (filesCount > 0) {
        previewStatus = 'ready';
        previewMessage = `${filesCount} file${filesCount !== 1 ? 's' : ''} ready to publish`;
      } else {
        previewStatus = 'warning';
        previewMessage = 'No files found to publish';
      }
    }

    // Check npm auth token
    const hasNpmToken = !!(process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN);
    const npmStatus: ChecklistItemStatus = hasNpmToken ? 'ready' : 'error';
    const npmMessage = hasNpmToken
      ? 'npm token configured'
      : 'Set NPM_TOKEN (granular access token) in environment';

    // Determine if can publish
    const canPublish =
      planStatus === 'ready' &&
      changelogStatus === 'ready' &&
      buildStatus === 'ready' &&
      previewStatus === 'ready' &&
      npmStatus === 'ready';

    return {
      scope,
      plan: {
        status: planStatus,
        message: planMessage,
        packagesCount: packagesCount > 0 ? packagesCount : undefined,
        bump,
      },
      changelog: {
        status: changelogStatus,
        message: changelogMessage,
        commitsCount,
      },
      build: {
        status: buildStatus,
        message: buildMessage,
        builtCount: builtCount > 0 ? builtCount : undefined,
        totalCount: totalCount > 0 ? totalCount : undefined,
      },
      preview: {
        status: previewStatus,
        message: previewMessage,
        filesCount,
        totalSize,
      },
      npm: {
        status: npmStatus,
        message: npmMessage,
      },
      canPublish,
    };
  },
});
