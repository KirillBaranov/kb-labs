/**
 * Changelog Generator - Reusable changelog generation logic
 * Used by both release:run and release:changelog commands
 */

import type { Change, PackageRelease, ReleaseManifest, GitRange } from './types';
import type { ILLM, ILogger, IAnalytics } from '@kb-labs/sdk';
import { resolveGitRange } from './git-range';
import { parseCommits } from './parser';
import { detectProvider, enhanceChangeWithLinks } from './providers';
import { createReleaseManifest, formatAsJson } from './formatters/json';
import { loadTemplate, packageToTemplateData } from './templates';

const CHANGELOG_LLM_TIMEOUT_MS = 45_000;

async function renderWithTimeout(result: string | Promise<string>): Promise<string> {
  if (typeof result === 'string') return result;
  return Promise.race([
    result,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Changelog LLM render timeout after 45s')), CHANGELOG_LLM_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Package info for changelog generation
 */
export interface ChangelogPackageInfo {
  name: string;
  path: string;
  currentVersion: string;
  nextVersion: string;
  bump: 'patch' | 'minor' | 'major' | 'none';
}

/**
 * Changelog generation options
 */
export interface GenerateChangelogOptions {
  /** Root directory of the repository */
  repoRoot: string;
  /** Git working directory (for submodule support) */
  gitCwd?: string;
  /** Packages to generate changelog for */
  packages: ChangelogPackageInfo[];
  /** Git range options */
  range?: {
    from?: string;
    to?: string;
    sinceTag?: string;
  };
  /** Changelog configuration */
  changelog?: {
    template?: string;
    locale?: 'en' | 'ru';
    metadata?: Record<string, unknown>;
    ignoreAuthors?: string[];
    includeTypes?: string[];
    excludeTypes?: string[];
    collapseMerges?: boolean;
    collapseReverts?: boolean;
    preferMergeSummary?: boolean;
    groups?: Array<{ title: string; emoji?: string; scopes: string[] }>;
  };
  /** Git configuration */
  git?: {
    autoUnshallow?: boolean;
    requireSignedTags?: boolean;
    baseUrl?: string;
  };
  /** Platform services for AI-powered formatting, logging, and analytics */
  platform?: { llm?: ILLM; logger?: ILogger; analytics?: IAnalytics };
  /** Progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Changelog generation result
 */
export interface GenerateChangelogResult {
  /** Generated markdown content */
  markdown: string;
  /** Release manifest (JSON structure) */
  manifest: ReleaseManifest;
  /** Parsed and enhanced changes */
  changes: Change[];
  /** Git range used */
  range: GitRange;
  /** Package releases */
  packages: PackageRelease[];
}

/**
 * Generate changelog for packages
 *
 * This is the main reusable function for changelog generation.
 * Used by both release:run and release:changelog commands.
 */
export async function generateChangelog(
  options: GenerateChangelogOptions
): Promise<GenerateChangelogResult> {
  const {
    repoRoot,
    gitCwd = repoRoot,
    packages,
    range: rangeOptions,
    changelog: changelogConfig,
    git: gitConfig,
    platform,
    onProgress,
  } = options;

  const locale = changelogConfig?.locale || 'en';

  // Step 1: Resolve git range
  onProgress?.('Resolving git range...');
  const range = await resolveGitRange({
    cwd: gitCwd,
    from: rangeOptions?.from,
    to: rangeOptions?.to || 'HEAD',
    sinceTag: rangeOptions?.sinceTag,
    autoUnshallow: gitConfig?.autoUnshallow,
    requireSignedTags: gitConfig?.requireSignedTags,
  });

  // Step 2: Detect git provider
  onProgress?.('Detecting git provider...');
  const provider = await detectProvider(gitCwd, gitConfig?.baseUrl);

  // Step 3: Parse commits
  onProgress?.('Parsing commits...');
  const changes = await parseCommits({
    cwd: gitCwd,
    from: range.from,
    to: range.to,
    ignoreAuthors: changelogConfig?.ignoreAuthors || [],
    includeTypes: changelogConfig?.includeTypes,
    excludeTypes: changelogConfig?.excludeTypes,
    collapseMerges: changelogConfig?.collapseMerges,
    collapseReverts: changelogConfig?.collapseReverts,
    preferMergeSummary: changelogConfig?.preferMergeSummary,
  });

  // Step 4: Enhance changes with provider links
  onProgress?.('Enhancing changes with links...');
  const enhancedChanges = changes.map(change => enhanceChangeWithLinks(change, provider));

  // Step 5: Build package releases
  onProgress?.('Building package releases...');

  // Normalize a package path to a relative-from-gitCwd prefix for matching against
  // filesChanged entries (which git reports relative to gitCwd).
  function normalizePkgPath(pkgPath: string): string {
    // Prefer normalizing relative to gitCwd (where git was run from),
    // then fall back to repoRoot.
    let rel: string;
    if (pkgPath.startsWith(gitCwd)) {
      rel = pkgPath.slice(gitCwd.length).replace(/^\/+/, '');
    } else if (pkgPath.startsWith(repoRoot)) {
      rel = pkgPath.slice(repoRoot.length).replace(/^\/+/, '');
    } else {
      rel = pkgPath.replace(/^\/+/, '');
    }
    return rel.endsWith('/') ? rel : rel + '/';
  }

  const packageReleases: PackageRelease[] = packages.map(pkg => {
    const pkgPrefix = normalizePkgPath(pkg.path);

    // Filter changes that touched at least one file inside this package's directory.
    // Falls back to all changes when the package sits at repo root (monorepo root release).
    const isRoot = pkgPrefix === '/' || pkgPrefix === '' || pkgPrefix === './';
    const pkgChanges = isRoot
      ? enhancedChanges
      : enhancedChanges.filter(c =>
          !c.filesChanged || c.filesChanged.length === 0
            ? true // keep commits with no file info (e.g. merge commits, empty commits)
            : c.filesChanged.some(f => f.startsWith(pkgPrefix))
        );

    const hasBreaking = pkgChanges.some(c => c.breaking && c.breaking.length > 0);
    const hasFeat = pkgChanges.some(c => c.type === 'feat');
    const hasFix = pkgChanges.some(c => c.type === 'fix');
    const hasPerf = pkgChanges.some(c => c.type === 'perf');

    let reason: 'breaking' | 'feat' | 'fix' | 'perf' | 'ripple' | 'manual' = 'manual';
    if (hasBreaking) {reason = 'breaking';}
    else if (hasFeat) {reason = 'feat';}
    else if (hasFix) {reason = 'fix';}
    else if (hasPerf) {reason = 'perf';}

    return {
      name: pkg.name,
      prev: pkg.currentVersion,
      next: pkg.nextVersion,
      bump: pkg.bump,
      reason,
      breaking: pkgChanges.filter(c => c.breaking && c.breaking.length > 0).flatMap(c => c.breaking!),
      changes: pkgChanges,
    };
  });

  // Step 6: Create release manifest
  const manifest = createReleaseManifest(range, packageReleases);

  // Step 7: Detect lockstep — all packages share the same next version
  const uniqueNextVersions = new Set(packageReleases.map(p => p.next));
  const isLockstep = packageReleases.length > 1 && uniqueNextVersions.size === 1;

  let markdown: string;

  // Step 8: Load template and format
  const templateName = changelogConfig?.template || 'corporate-ai';
  onProgress?.(`Loading template "${templateName}"...`);
  const template = await loadTemplate(templateName, repoRoot);

  if (isLockstep) {
    // Consolidated changelog for lockstep monorepo releases:
    // Merge all packages into one virtual release and render through template
    onProgress?.('Formatting consolidated lockstep changelog...');
    const sharedVersion = packageReleases[0]!.next;
    const sharedPrev = packageReleases[0]!.prev;

    // Use ALL parsed changes (not just package-filtered ones) for lockstep changelog.
    // Package filtering can miss root-level commits (e.g. config, CI, docs) that don't
    // touch files inside packages/ directories but are still part of the release.
    const mergedChanges = enhancedChanges;

    // Merge breaking changes from all commits
    const seenBreaking = new Set<string>();
    const mergedBreaking = enhancedChanges
      .filter(c => c.breaking && c.breaking.length > 0)
      .flatMap(c => c.breaking!)
      .filter(b => {
        if (seenBreaking.has(b.summary)) {return false;}
        seenBreaking.add(b.summary);
        return true;
      });

    // Determine overall reason from merged changes
    const hasBreaking = mergedBreaking.length > 0;
    const hasFeat = mergedChanges.some(c => c.type === 'feat');
    const hasFix = mergedChanges.some(c => c.type === 'fix');
    const hasPerf = mergedChanges.some(c => c.type === 'perf');
    let reason: 'breaking' | 'feat' | 'fix' | 'perf' | 'ripple' | 'manual' = 'manual';
    if (hasBreaking) {reason = 'breaking';}
    else if (hasFeat) {reason = 'feat';}
    else if (hasFix) {reason = 'fix';}
    else if (hasPerf) {reason = 'perf';}

    // Build scope display name
    const scopeName = packages.length > 0 ? packages[0]!.name.replace(/\/[^/]+$/, '') : 'monorepo';

    // Build lockstep header with packages table
    const date = new Date().toISOString().split('T')[0]!;
    const pkgWord = locale === 'ru' ? 'пакетов' : packages.length === 1 ? 'package' : 'packages';
    const headerLines: string[] = [
      `## [${sharedVersion}] - ${date}`,
      '',
      `**${packageReleases.length} ${pkgWord}** bumped to v${sharedVersion}`,
      '',
      `| ${locale === 'ru' ? 'Пакет' : 'Package'} | ${locale === 'ru' ? 'Предыдущая' : 'Previous'} | ${locale === 'ru' ? 'Тип' : 'Bump'} |`,
      `|---------|----------|------|`,
      ...packageReleases.filter(p => p.bump !== 'none').map(p => `| \`${p.name}\` | ${p.prev} | ${p.bump} |`),
      '',
    ];

    // Render merged changes through template (gets LLM enhancement)
    const mergedRelease: PackageRelease = {
      name: scopeName,
      prev: sharedPrev,
      next: sharedVersion,
      bump: packageReleases[0]!.bump,
      reason,
      breaking: mergedBreaking,
      changes: mergedChanges,
    };

    onProgress?.('Enhancing lockstep changelog with template...');
    const templateData = packageToTemplateData(mergedRelease, locale, changelogConfig?.metadata, changelogConfig?.groups);
    const rendered = await renderWithTimeout(template.render(templateData, platform));

    // Strip the template's own header (## [version] - date + blockquote) — we use lockstep header instead
    const renderedLines = rendered.split('\n');
    let contentStartIdx = 0;
    for (let i = 0; i < renderedLines.length; i++) {
      const line = renderedLines[i]!;
      // Skip header lines: ## [version], empty lines, and > blockquote
      if (line.startsWith('## [') || line.startsWith('> **') || line.trim() === '') {
        contentStartIdx = i + 1;
      } else {
        break;
      }
    }
    const contentBody = renderedLines.slice(contentStartIdx).join('\n').trim();

    markdown = headerLines.join('\n') + (contentBody ? '\n' + contentBody : `\n*${locale === 'ru' ? 'Без функциональных изменений.' : 'No functional changes.'}*`);
  } else {
    // Format each package separately through template
    const formattedPackages: string[] = [];
    for (let i = 0; i < packageReleases.length; i++) {
      const pkg = packageReleases[i];
      if (!pkg) {continue;}

      onProgress?.(`Formatting changelog for ${pkg.name} (${i + 1}/${packageReleases.length})...`);

      const templateData = packageToTemplateData(pkg, locale, changelogConfig?.metadata, changelogConfig?.groups);
      const formatted = await renderWithTimeout(template.render(templateData, platform));

      formattedPackages.push(formatted);
    }

    markdown = formattedPackages.join('\n\n');
  }

  return {
    markdown,
    manifest: JSON.parse(formatAsJson(manifest)),
    changes: enhancedChanges,
    range,
    packages: packageReleases,
  };
}

/**
 * Generate simple fallback changelog (no LLM, no templates)
 */
export function generateSimpleChangelog(
  packages: ChangelogPackageInfo[],
  locale: 'en' | 'ru' = 'en'
): string {
  const date = new Date().toISOString().split('T')[0]!;

  // Detect lockstep (all packages share same next version)
  const uniqueVersions = new Set(packages.map(p => p.nextVersion));
  const isLockstep = packages.length > 1 && uniqueVersions.size === 1;

  if (isLockstep) {
    const version = packages[0]!.nextVersion;
    const title = locale === 'ru' ? 'Релиз' : 'Release';
    const pkgWord = locale === 'ru' ? 'пакетов' : packages.length === 1 ? 'package' : 'packages';
    const lines: string[] = [
      `## [${version}] - ${date}`,
      '',
      `**${packages.length} ${pkgWord}** bumped to v${version}`,
      '',
      `| Package | Previous | Bump |`,
      `|---------|----------|------|`,
      ...packages.map(p => `| \`${p.name}\` | ${p.currentVersion} | ${p.bump} |`),
    ];
    return lines.join('\n');
  }

  const title = locale === 'ru' ? 'Релиз' : 'Release';
  const lines: string[] = [`## [${date}] ${title}\n\n`];

  for (const pkg of packages) {
    lines.push(`- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.nextVersion}`);
  }

  return lines.join('\n');
}
