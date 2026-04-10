/**
 * quality:check-types - TypeScript type safety analysis
 *
 * Analyzes TypeScript type errors, warnings, and coverage across monorepo.
 * Uses TypeScript Compiler API for semantic analysis.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { analyzeTypes } from '@kb-labs/quality-core/types';
import { CACHE_KEYS, type TypeAnalysisResult } from '@kb-labs/quality-contracts';
import { type CheckTypesFlags } from './flags.js';

// Input type with backward compatibility
type CheckTypesInput = CheckTypesFlags & { argv?: string[] };

type CheckTypesCommandResult = {
  exitCode: number;
  result?: TypeAnalysisResult;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:check-types',
  description: 'Analyze TypeScript type safety across monorepo',

  handler: {
    async execute(
      ctx: PluginContextV3,
      input: CheckTypesInput
    ): Promise<CheckTypesCommandResult> {
      const { ui, platform } = ctx;

      // V3: Flags come in input.flags object (not auto-merged)
      const flags = (input as any).flags ?? input;

      const cacheKey = `${CACHE_KEYS.TYPE_ANALYSIS}:${flags.package || 'all'}`;

      // Check cache unless refresh requested
      if (!flags.refresh) {
        const cached = await platform.cache.get<TypeAnalysisResult>(cacheKey);
        if (cached) {
          outputTypeAnalysis({ ...cached, cached: true }, flags, ui);
          return { exitCode: cached.totalErrors > 0 ? 1 : 0, result: cached };
        }
      }

      // Run type analysis
      const result = await analyzeTypes(ctx.cwd, {
        packageFilter: flags.package,
        errorsOnly: flags['errors-only'],
      });

      // Cache result (10 min TTL)
      await platform.cache.set(cacheKey, result, 10 * 60 * 1000);

      // Track analytics
      await platform.analytics.track('quality:check-types', {
        packageFilter: flags.package || 'all',
        totalPackages: result.totalPackages,
        totalErrors: result.totalErrors,
        avgCoverage: result.avgCoverage,
        cached: false,
      });

      // Output results
      outputTypeAnalysis({ ...result, cached: false }, flags, ui);

      return {
        exitCode: result.totalErrors > 0 ? 1 : 0,
        result,
        meta: { cached: false },
      };
    },
  },
});

/**
 * Output type analysis results
 */
function outputTypeAnalysis(
  result: TypeAnalysisResult & { cached: boolean },
  flags: CheckTypesInput,
  ui: any
): void {
  if (flags.json) {
    ui?.json?.(result);
    return;
  }

  const errorsOnly = flags['errors-only'] || false;

  // Build sections
  const sections: Array<{ header: string; items: string[] }> = [];

  // Status section
  const statusIcon = result.totalErrors === 0 ? '✅' : '❌';
  const statusText =
    result.totalErrors === 0 ? 'All packages passed type checks' : 'Type errors detected';
  const statusItems = [
    `${statusIcon} ${statusText}`,
    `Analyzed: ${result.totalPackages} package(s)`,
    `Errors: ${result.totalErrors}`,
    `Warnings: ${result.totalWarnings}`,
    `Avg Coverage: ${result.avgCoverage.toFixed(1)}%`,
  ];

  sections.push({ header: 'Type Safety Status', items: statusItems });

  // Packages with errors
  if (result.packagesWithErrors > 0) {
    const errorItems: string[] = [];
    const packagesToShow = result.packages
      .filter((pkg) => !errorsOnly || pkg.errors > 0)
      .slice(0, 10);

    for (const pkg of packagesToShow) {
      const status = pkg.errors > 0 ? '❌' : '✅';
      errorItems.push(`${status} ${pkg.name}`);

      const details = [
        pkg.errors > 0 ? `${pkg.errors} error(s)` : null,
        pkg.warnings > 0 ? `${pkg.warnings} warning(s)` : null,
        `${pkg.coverage.toFixed(1)}% coverage`,
        pkg.anyCount > 0 ? `${pkg.anyCount} any` : null,
        pkg.tsIgnoreCount > 0 ? `${pkg.tsIgnoreCount} @ts-ignore` : null,
      ]
        .filter(Boolean)
        .join(', ');

      errorItems.push(`  ${details}`);
    }

    if (result.packages.length > 10) {
      errorItems.push(`... and ${result.packages.length - 10} more packages`);
    }

    sections.push({
      header: `Packages with Type Errors (${result.packagesWithErrors})`,
      items: errorItems,
    });
  }

  // Coverage distribution
  const excellent = result.packages.filter((p) => p.coverage >= 90).length;
  const good = result.packages.filter((p) => p.coverage >= 70 && p.coverage < 90).length;
  const poor = result.packages.filter((p) => p.coverage < 70).length;

  if (result.packages.length > 0) {
    const coverageItems = [
      `✅ Excellent (≥90%): ${excellent} package(s)`,
      `⚠️  Good (70-90%):   ${good} package(s)`,
      poor > 0 ? `❌ Poor (<70%):     ${poor} package(s)` : null,
    ].filter(Boolean) as string[];

    sections.push({ header: 'Type Coverage Distribution', items: coverageItems });
  }

  // Summary
  const summaryItems = [
    `Total packages: ${result.totalPackages}`,
    `Duration: ${(result.duration / 1000).toFixed(1)}s`,
    result.cached ? '💾 Cached (use --refresh to recheck)' : '🔄 Fresh analysis',
  ];

  sections.push({ header: 'Summary', items: summaryItems });

  const title =
    result.totalErrors === 0
      ? '✅ All Type Checks Passed'
      : `❌ ${result.packagesWithErrors} Package(s) with Type Errors`;

  ui?.success?.('Type analysis completed', {
    title,
    sections,
  });
}
