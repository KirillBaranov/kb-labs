/**
 * Changelog generate handler - Generate changelog using LLM
 *
 * Writes: .kb/release/plans/{scope}/current/changelog.md
 */

import { defineHandler, findRepoRoot, type RestInput } from '@kb-labs/sdk';
import type {
  GenerateChangelogRequest,
  GenerateChangelogResponse,
  ReleasePlan,
} from '@kb-labs/release-manager-contracts';
import {
  generateChangelog,
  generateSimpleChangelog,
  type ChangelogPackageInfo,
} from '@kb-labs/release-manager-changelog';
import { ANALYTICS_EVENTS, ANALYTICS_ACTOR } from '../../infra/analytics/events';
import { RELEASE_CACHE_PREFIX } from '@kb-labs/release-manager-contracts';
import { scopeToDir } from '../../shared/utils';

export default defineHandler({
  async execute(ctx, input: RestInput<unknown, GenerateChangelogRequest>): Promise<GenerateChangelogResponse> {
    const scope = input.body?.scope || 'root';
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);
    const startTime = Date.now();

    // Track start
    ctx.platform?.analytics?.track?.(ANALYTICS_EVENTS.CHANGELOG_STARTED, {
      scope,
      actor: ANALYTICS_ACTOR,
    });

    // 1. Read release plan to get package info
    const scopeDirName = scopeToDir(scope);
    const planPath = `${repoRoot}/.kb/release/plans/${scopeDirName}/current/plan.json`;
    let plan: ReleasePlan;
    try {
      const planContent = await ctx.runtime.fs.readFile(planPath, 'utf-8');
      plan = JSON.parse(planContent);
    } catch (error) {
      ctx.platform?.logger?.error?.(
        'Failed to read release plan',
        error instanceof Error ? error : undefined,
        { scope, planPath }
      );
      throw new Error(`Release plan not found for scope "${scope}". Generate plan first.`);
    }

    // 2. Convert plan packages to changelog format
    const packages: ChangelogPackageInfo[] = plan.packages.map(pkg => ({
      name: pkg.name,
      path: pkg.path,
      currentVersion: pkg.currentVersion,
      nextVersion: pkg.nextVersion,
      bump: pkg.bump === 'auto' ? 'patch' : pkg.bump,
    }));

    // 3. Determine git working directory (for submodule support)
    let gitCwd = repoRoot;
    if (packages.length > 0 && packages[0]) {
      try {
        gitCwd = await findRepoRoot(packages[0].path);
      } catch {
        gitCwd = packages[0].path;
      }
    }

    // 4. Generate changelog using real implementation
    let markdown: string;
    const tokensUsed = 0;
    let usedLLM = false;
    let commitsCount = 0;
    const useLLM = input.body?.useLLM ?? true;

    // Skip LLM if disabled - use simple changelog
    if (!useLLM) {
      ctx.platform?.logger?.info?.('Using simple changelog (LLM disabled by user)', { scope });
      markdown = generateSimpleChangelog(packages, 'en');
    } else {
      const hasLLM = !!ctx.platform?.llm;
      ctx.platform?.logger?.info?.('Changelog generation mode', {
        scope,
        useLLM,
        hasLLMPlatform: hasLLM,
      });

      if (!hasLLM) {
        ctx.platform?.logger?.warn?.('LLM service not available, falling back to simple changelog', { scope });
        markdown = generateSimpleChangelog(packages, 'en');
      } else {
        try {
          ctx.platform?.logger?.info?.('Starting LLM changelog generation', {
            scope,
            packagesCount: packages.length,
            template: 'corporate-ai',
          });

          const result = await generateChangelog({
            repoRoot,
            gitCwd,
            packages,
            range: {
              from: undefined, // Auto-detect from tags
              to: 'HEAD',
            },
            changelog: {
              template: 'corporate-ai',
              locale: input.body?.locale || 'en',
            },
            platform: {
              llm: ctx.platform.llm,
              logger: ctx.platform.logger,
              analytics: ctx.platform.analytics,
            },
          });

          markdown = result.markdown;
          commitsCount = result.changes.length;
          usedLLM = true;

          ctx.platform?.logger?.info?.('LLM changelog generated', {
            scope,
            markdownLength: markdown.length,
            linesCount: markdown.split('\n').length,
            commitsCount,
          });
        } catch (error) {
          // Fallback to simple changelog if generation fails
          ctx.platform?.logger?.error?.(
            'Changelog generation failed, using simple fallback',
            error instanceof Error ? error : undefined,
            { scope, packagesCount: packages.length }
          );
          markdown = generateSimpleChangelog(packages, 'en');
        }
      }
    }

    // 5. Ensure directory exists
    const scopeDir = `${repoRoot}/.kb/release/plans/${scopeDirName}/current`;
    await ctx.runtime.fs.mkdir(scopeDir, { recursive: true });

    // 6. Write changelog
    const changelogPath = `${scopeDir}/changelog.md`;
    await ctx.runtime.fs.writeFile(changelogPath, markdown, { encoding: 'utf-8' });

    // 7. Invalidate cache so next GET request fetches fresh data
    const cacheKey = `${RELEASE_CACHE_PREFIX}changelog:${scope}`;
    await ctx.platform?.cache?.delete(cacheKey);

    const duration = Date.now() - startTime;

    ctx.platform?.logger?.info?.('Changelog generated', {
      scope,
      path: changelogPath,
      packagesCount: packages.length,
      commitsCount,
      usedLLM,
      durationMs: duration,
    });

    // Track completion
    ctx.platform?.analytics?.track?.(ANALYTICS_EVENTS.CHANGELOG_FINISHED, {
      scope,
      packagesCount: packages.length,
      commitsCount,
      durationMs: duration,
      tokensUsed,
      usedLLM,
      actor: ANALYTICS_ACTOR,
    });

    return {
      scope,
      markdown,
      changelogPath,
      tokensUsed,
      usedLLM,
      commitsCount,
    };
  }
});
