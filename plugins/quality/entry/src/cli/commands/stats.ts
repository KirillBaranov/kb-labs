/**
 * quality:stats - Monorepo statistics and health score
 *
 * Collects comprehensive statistics about the monorepo including:
 * - Package count by repository
 * - Total lines of code
 * - File counts
 * - Dependency statistics
 * - Health score (if --health flag provided)
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import type { StatsResult, Issue } from '@kb-labs/quality-contracts';
import { CACHE_KEYS } from '@kb-labs/quality-contracts';
import fs from 'node:fs';
import path from 'node:path';
import type { StatsFlags } from './flags.js';

// Input type with backward compatibility
type StatsInput = StatsFlags & { argv?: string[] };

type StatsCommandResult = {
  exitCode: number;
  result?: StatsResult;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:stats',
  description: 'Show monorepo statistics and health score',

  handler: {
    async execute(ctx: PluginContextV3, input: StatsInput): Promise<StatsCommandResult> {
      const { ui, platform } = ctx;

      // V3: Flags may come wrapped in input.flags or passed directly
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: StatsInput }).flags
        : input;

      // Check cache unless refresh requested
      if (!flags.refresh) {
        const cached = await platform.cache.get<StatsResult>(CACHE_KEYS.STATS);
        if (cached) {
          outputStats(cached, flags, ui);
          return { exitCode: 0 };
        }
      }

      // Collect statistics
      const stats = await collectStats(ctx.cwd);

      // Calculate health score if requested
      if (flags.health) {
        stats.health = calculateHealthScore(stats);
      }

      // Cache results for 5 minutes
      await platform.cache.set(CACHE_KEYS.STATS, stats, 5 * 60 * 1000);

      // Track analytics
      await platform.analytics.track('quality:stats', {
        packages: stats.overview.totalPackages,
        repositories: stats.overview.totalRepositories,
        withHealth: flags.health ?? false,
      });

      // Output results
      outputStats(stats, flags, ui);

      return { exitCode: 0 };
    },
  },
});

/**
 * Find all packages in the monorepo
 */
function findPackages(rootDir: string): string[] {
  const packages: string[] = [];

  if (!fs.existsSync(rootDir)) {
    return packages;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('kb-labs-')) {continue;}

    const repoPath = path.join(rootDir, entry.name);
    const packagesDir = path.join(repoPath, 'packages');

    if (!fs.existsSync(packagesDir)) {continue;}

    const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const pkgDir of packageDirs) {
      if (!pkgDir.isDirectory()) {continue;}

      const packageJsonPath = path.join(packagesDir, pkgDir.name, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        packages.push(packageJsonPath);
      }
    }
  }

  return packages;
}

/**
 * Calculate package size (files, lines, bytes)
 */
function calculateSize(packageDir: string): { files: number; lines: number; bytes: number } {
  const srcDir = path.join(packageDir, 'src');
  if (!fs.existsSync(srcDir)) {
    return { files: 0, lines: 0, bytes: 0 };
  }

  let files = 0;
  let lines = 0;
  let bytes = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        lines += content.split('\n').length;
        bytes += Buffer.byteLength(content, 'utf-8');
      }
    }
  }

  walk(srcDir);
  return { files, lines, bytes };
}

/**
 * Collect comprehensive statistics
 */
async function collectStats(rootDir: string): Promise<StatsResult> {
  const packages = findPackages(rootDir);

  const stats: StatsResult = {
    overview: {
      totalPackages: 0,
      totalRepositories: 0,
      totalFiles: 0,
      totalLines: 0,
      totalBytes: 0,
    },
    byRepository: {},
    dependencies: {
      total: 0,
      workspace: 0,
      external: 0,
      duplicates: 0,
      topUsed: [],
    },
    health: {
      score: 0,
      grade: 'F',
      issues: [],
    },
    largestPackages: [],
  };

  const repos = new Set<string>();
  const allDeps = new Map<string, number>();

  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    stats.overview.totalPackages++;

    const packageDir = path.dirname(packagePath);
    const repoName = path.basename(path.dirname(path.dirname(packageDir)));

    repos.add(repoName);

    const size = calculateSize(packageDir);
    stats.overview.totalFiles += size.files;
    stats.overview.totalLines += size.lines;
    stats.overview.totalBytes += size.bytes;

    // Track by repository
    if (!stats.byRepository[repoName]) {
      stats.byRepository[repoName] = {
        name: repoName,
        packages: 0,
        files: 0,
        lines: 0,
        bytes: 0,
      };
    }

    stats.byRepository[repoName].packages++;
    stats.byRepository[repoName].files += size.files;
    stats.byRepository[repoName].lines += size.lines;
    stats.byRepository[repoName].bytes += size.bytes;

    // Track dependencies
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dep of Object.keys(deps)) {
      stats.dependencies.total++;

      if (dep.startsWith('@kb-labs/')) {
        stats.dependencies.workspace++;
      } else {
        stats.dependencies.external++;
      }

      allDeps.set(dep, (allDeps.get(dep) || 0) + 1);
    }

    // Track package for largest packages list
    stats.largestPackages.push({
      name: packageName,
      repository: repoName,
      files: size.files,
      lines: size.lines,
      bytes: size.bytes,
    });
  }

  stats.overview.totalRepositories = repos.size;

  // Find duplicates
  stats.dependencies.duplicates = Array.from(allDeps.values()).filter(count => count > 1).length;

  // Top 10 most used dependencies
  stats.dependencies.topUsed = Array.from(allDeps.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Sort largest packages by lines
  stats.largestPackages.sort((a, b) => b.lines - a.lines);
  stats.largestPackages = stats.largestPackages.slice(0, 10);

  return stats;
}

/**
 * Calculate health score
 */
function calculateHealthScore(stats: StatsResult) {
  let score = 100;
  const issues: Issue[] = [];

  // Penalize for duplicate dependencies
  if (stats.dependencies.duplicates > 0) {
    const penalty = Math.min(20, stats.dependencies.duplicates * 2);
    score -= penalty;
    issues.push({
      type: 'duplicates',
      severity: 'warning',
      message: `${stats.dependencies.duplicates} duplicate dependencies (-${penalty})`,
    });
  }

  // Penalize for missing README files (would need to check, simplified here)
  // This is a placeholder - real implementation would scan for README files

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) {grade = 'A';}
  else if (score >= 80) {grade = 'B';}
  else if (score >= 70) {grade = 'C';}
  else if (score >= 60) {grade = 'D';}
  else {grade = 'F';}

  return {
    score,
    grade,
    issues,
  };
}

/**
 * Output statistics in requested format
 */
function outputStats(stats: StatsResult, flags: Record<string, unknown>, ui: PluginContextV3['ui']) {
  if (flags.json) {
    ui?.json?.(stats);
    return;
  }

  if (flags.md) {
    outputMarkdown(stats);
    return;
  }

  // Default: formatted output using V3 ctx.ui API
  const overviewItems = [
    `Packages: ${stats.overview.totalPackages}`,
    `Repositories: ${stats.overview.totalRepositories}`,
    `Lines of Code: ${stats.overview.totalLines.toLocaleString()}`,
    `Total Size: ${formatBytes(stats.overview.totalBytes)}`,
  ];

  const sections: Array<{ header: string; items: string[] }> = [
    { header: 'Overview', items: overviewItems },
  ];

  // Add health section if requested
  if (flags.health && stats.health) {
    const healthItems = [
      `Score: ${stats.health.score}/100 (Grade ${stats.health.grade})`,
    ];

    if (stats.health.issues.length > 0) {
      healthItems.push('');
      healthItems.push('Issues:');
      stats.health.issues.forEach(issue => {
        healthItems.push(`  ${issue.message}`);
      });
    }

    sections.push({ header: 'Health Score', items: healthItems });
  }

  // Add top repositories
  const topRepos = Object.values(stats.byRepository)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 5)
    .map(repo => `${repo.name}: ${repo.lines.toLocaleString()} lines, ${repo.packages} pkg(s)`);

  if (topRepos.length > 0) {
    sections.push({ header: 'Top Repositories', items: topRepos });
  }

  ui?.success?.('Statistics collected successfully', {
    title: '📊 KB Labs Monorepo Statistics',
    sections,
  });
}

/**
 * Output Markdown table
 */
function outputMarkdown(stats: StatsResult) {
  console.log('# KB Labs Monorepo Statistics\n');
  console.log('## Overview\n');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log(`| Packages | ${stats.overview.totalPackages} |`);
  console.log(`| Repositories | ${stats.overview.totalRepositories} |`);
  console.log(`| Lines of Code | ${stats.overview.totalLines.toLocaleString()} |`);
  console.log(`| Total Size | ${formatBytes(stats.overview.totalBytes)} |\n`);

  if (stats.health) {
    console.log('## Health Score\n');
    console.log(`**${stats.health.score}/100** (Grade ${stats.health.grade})\n`);

    if (stats.health.issues.length > 0) {
      console.log('### Issues\n');
      for (const issue of stats.health.issues) {
        console.log(`- ${issue.message}`);
      }
      console.log('');
    }
  }

  console.log('## By Repository\n');
  console.log('| Repository | Packages | Lines | Size |');
  console.log('|------------|----------|-------|------|');
  for (const [name, repo] of Object.entries(stats.byRepository)) {
    console.log(`| ${name} | ${repo.packages} | ${repo.lines.toLocaleString()} | ${formatBytes(repo.bytes)} |`);
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
