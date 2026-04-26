/**
 * Changelog generate handler - Generate changelog using LLM
 *
 * Writes: .kb/release/plans/{scope}/current/changelog.md
 */

import { defineHandler, findRepoRoot, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
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

// ── helpers ────────────────────────────────────────────────────────────────

interface GenerateResult {
  markdown: string;
  commitsCount: number;
  usedLLM: boolean;
}

async function generateWithLLM(
  ctx: PluginContextV3,
  packages: ChangelogPackageInfo[],
  repoRoot: string,
  gitCwd: string,
  locale: 'en' | 'ru',
  scope: string,
): Promise<GenerateResult> {
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
      range: { from: undefined, to: 'HEAD' },
      changelog: { template: 'corporate-ai', locale },
      platform: {
        llm: ctx.platform.llm,
        logger: ctx.platform.logger,
        analytics: ctx.platform.analytics,
      },
    });
    ctx.platform?.logger?.info?.('LLM changelog generated', {
      scope,
      markdownLength: result.markdown.length,
      linesCount: result.markdown.split('\n').length,
      commitsCount: result.changes.length,
    });
    return { markdown: result.markdown, commitsCount: result.changes.length, usedLLM: true };
  } catch (err) {
    ctx.platform?.logger?.error?.(
      'Changelog generation failed, using simple fallback',
      err instanceof Error ? err : undefined,
      { scope, packagesCount: packages.length },
    );
    return { markdown: generateSimpleChangelog(packages, 'en'), commitsCount: 0, usedLLM: false };
  }
}

async function resolveMarkdown(
  ctx: PluginContextV3,
  packages: ChangelogPackageInfo[],
  repoRoot: string,
  gitCwd: string,
  locale: 'en' | 'ru',
  useLLMFlag: boolean,
  scope: string,
): Promise<GenerateResult> {
  if (!useLLMFlag) {
    ctx.platform?.logger?.info?.('Using simple changelog (LLM disabled by user)', { scope });
    return { markdown: generateSimpleChangelog(packages, 'en'), commitsCount: 0, usedLLM: false };
  }
  const hasLLM = !!ctx.platform?.llm;
  ctx.platform?.logger?.info?.('Changelog generation mode', { scope, useLLM: useLLMFlag, hasLLMPlatform: hasLLM });
  if (!hasLLM) {
    ctx.platform?.logger?.warn?.('LLM service not available, falling back to simple changelog', { scope });
    return { markdown: generateSimpleChangelog(packages, 'en'), commitsCount: 0, usedLLM: false };
  }
  return generateWithLLM(ctx, packages, repoRoot, gitCwd, locale, scope);
}

async function resolveGitCwd(packages: ChangelogPackageInfo[], repoRoot: string): Promise<string> {
  if (!packages.length || !packages[0]) { return repoRoot; }
  try {
    return await findRepoRoot(packages[0].path);
  } catch {
    return packages[0].path;
  }
}

// ── handler ────────────────────────────────────────────────────────────────

export default defineHandler({
  async execute(ctx, input: RestInput<unknown, GenerateChangelogRequest>): Promise<GenerateChangelogResponse> {
    const scope = input.body?.scope || 'root';
    const cwd = ctx.cwd ?? process.cwd();
    const repoRoot = await findRepoRoot(cwd);
    const startTime = Date.now();

    ctx.platform?.analytics?.track?.(ANALYTICS_EVENTS.CHANGELOG_STARTED, { scope, actor: ANALYTICS_ACTOR });

    const scopeDirName = scopeToDir(scope);
    const planPath = `${repoRoot}/.kb/release/plans/${scopeDirName}/current/plan.json`;
    let plan: ReleasePlan;
    try {
      const planContent = await ctx.runtime.fs.readFile(planPath, 'utf-8');
      plan = JSON.parse(planContent);
    } catch (err) {
      ctx.platform?.logger?.error?.(
        'Failed to read release plan',
        err instanceof Error ? err : undefined,
        { scope, planPath },
      );
      throw new Error(`Release plan not found for scope "${scope}". Generate plan first.`);
    }

    const packages: ChangelogPackageInfo[] = plan.packages.map(pkg => ({
      name: pkg.name,
      path: pkg.path,
      currentVersion: pkg.currentVersion,
      nextVersion: pkg.nextVersion,
      bump: pkg.bump === 'auto' ? 'patch' : pkg.bump,
    }));

    const gitCwd = await resolveGitCwd(packages, repoRoot);

    const localeRaw = input.body?.locale;
    const locale: 'en' | 'ru' = localeRaw === 'ru' ? 'ru' : 'en';

    const { markdown, commitsCount, usedLLM } = await resolveMarkdown(
      ctx,
      packages,
      repoRoot,
      gitCwd,
      locale,
      input.body?.useLLM ?? true,
      scope,
    );

    const scopeDir = `${repoRoot}/.kb/release/plans/${scopeDirName}/current`;
    await ctx.runtime.fs.mkdir(scopeDir, { recursive: true });

    const changelogPath = `${scopeDir}/changelog.md`;
    await ctx.runtime.fs.writeFile(changelogPath, markdown, { encoding: 'utf-8' });

    const cacheKey = `${RELEASE_CACHE_PREFIX}changelog:${scope}`;
    await ctx.platform?.cache?.delete(cacheKey);

    const duration = Date.now() - startTime;
    const tokensUsed = 0;

    ctx.platform?.logger?.info?.('Changelog generated', {
      scope, path: changelogPath, packagesCount: packages.length,
      commitsCount, usedLLM, durationMs: duration,
    });

    ctx.platform?.analytics?.track?.(ANALYTICS_EVENTS.CHANGELOG_FINISHED, {
      scope, packagesCount: packages.length, commitsCount,
      durationMs: duration, tokensUsed, usedLLM, actor: ANALYTICS_ACTOR,
    });

    return { scope, markdown, changelogPath, tokensUsed, usedLLM, commitsCount };
  }
});
