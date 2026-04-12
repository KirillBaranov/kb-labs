/**
 * quality:check-tests - Test execution and coverage tracking
 *
 * Runs tests across monorepo packages and collects coverage statistics.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { runTests } from '@kb-labs/quality-core/tests';
import { CACHE_KEYS, type TestRunResult } from '@kb-labs/quality-contracts';
import { type CheckTestsFlags } from './flags.js';

// Input type with backward compatibility
type CheckTestsInput = CheckTestsFlags & { argv?: string[] };

type CheckTestsCommandResult = {
  exitCode: number;
  result?: TestRunResult;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:check-tests',
  description: 'Run tests and track coverage across monorepo',

  handler: {
    async execute(
      ctx: PluginContextV3,
      input: CheckTestsInput
    ): Promise<CheckTestsCommandResult> {
      const { ui, platform } = ctx;

      // V3: Flags come in input.flags object (not auto-merged)
      const flags = (input as any).flags ?? input;

      const cacheKey = `${CACHE_KEYS.TESTS}:${flags.package || 'all'}`;

      // Check cache unless refresh requested
      if (!flags.refresh) {
        const cached = await platform.cache.get<TestRunResult>(cacheKey);
        if (cached) {
          outputTestResults({ ...cached, cached: true }, flags, ui);
          return { exitCode: cached.failing > 0 ? 1 : 0, result: cached };
        }
      }

      // Run tests
      const result = await runTests(ctx.cwd, {
        packageFilter: flags.package,
        timeout: flags.timeout ? Number(flags.timeout) : 60000,
        withCoverage: flags['with-coverage'],
        coverageOnly: flags['coverage-only'],
      });

      // Cache result (5 min TTL - tests are slower)
      await platform.cache.set(cacheKey, result, 5 * 60 * 1000);

      // Track analytics
      await platform.analytics.track('quality:check-tests', {
        packageFilter: flags.package || 'all',
        totalPackages: result.totalPackages,
        passing: result.passing,
        failing: result.failing,
        withCoverage: flags['with-coverage'],
        cached: false,
      });

      // Output results
      outputTestResults({ ...result, cached: false }, flags, ui);

      return {
        exitCode: result.failing > 0 ? 1 : 0,
        result,
        meta: { cached: false },
      };
    },
  },
});

/**
 * Output test results
 */
function outputTestResults(
  result: TestRunResult & { cached: boolean },
  flags: CheckTestsInput,
  ui: any
): void {
  if (flags.json) {
    ui?.json?.(result);
    return;
  }

  // Build sections
  const sections: Array<{ header: string; items: string[] }> = [];

  // Status section
  const statusIcon = result.failing === 0 ? '✅' : '❌';
  const statusText = result.failing === 0 ? 'All tests passing' : 'Test failures detected';
  const statusItems = [
    `${statusIcon} ${statusText}`,
    `Total packages: ${result.totalPackages}`,
    `Passing: ${result.passing}`,
    result.failing > 0 ? `Failing: ${result.failing}` : null,
    result.skipped > 0 ? `Skipped: ${result.skipped} (no test script)` : null,
  ].filter(Boolean) as string[];

  sections.push({ header: 'Test Status', items: statusItems });

  // Test summary
  if (result.summary.totalTests > 0) {
    const summaryItems = [
      `Total tests: ${result.summary.totalTests}`,
      `Passed: ${result.summary.passedTests}`,
      result.summary.failedTests > 0 ? `Failed: ${result.summary.failedTests}` : null,
    ].filter(Boolean) as string[];

    sections.push({ header: 'Test Summary', items: summaryItems });
  }

  // Failed packages
  if (result.failures.length > 0) {
    const failureItems: string[] = [];
    for (const failure of result.failures.slice(0, 5)) {
      failureItems.push(`❌ ${failure.package}`);
      if (failure.failedTests && failure.totalTests) {
        failureItems.push(`  ${failure.failedTests}/${failure.totalTests} tests failed`);
      }
      // Show first line of error
      const firstLine = failure.error.split('\n')[0];
      failureItems.push(`  ${firstLine?.substring(0, 80) || 'Test failed'}`);
    }

    if (result.failures.length > 5) {
      failureItems.push(`... and ${result.failures.length - 5} more failures`);
    }

    sections.push({ header: 'Failed Packages', items: failureItems });
  }

  // Coverage section (if available)
  if (result.coverage.packages.length > 0) {
    const coverageItems: string[] = [];
    coverageItems.push(`Average coverage: ${result.coverage.avgCoverage.toFixed(1)}%`);
    coverageItems.push('');

    const topPackages = result.coverage.packages
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 5);

    for (const pkg of topPackages) {
      coverageItems.push(`${pkg.name}`);
      coverageItems.push(
        `  Lines: ${pkg.lines.toFixed(1)}% | Statements: ${pkg.statements.toFixed(1)}% | Functions: ${pkg.functions.toFixed(1)}% | Branches: ${pkg.branches.toFixed(1)}%`
      );
    }

    if (result.coverage.packages.length > 5) {
      coverageItems.push(`... and ${result.coverage.packages.length - 5} more packages`);
    }

    sections.push({ header: 'Coverage', items: coverageItems });
  }

  // Summary
  const summaryItems = [
    `Duration: ${(result.duration / 1000).toFixed(1)}s`,
    result.cached ? '💾 Cached (use --refresh to re-run)' : '🔄 Fresh run',
  ];

  sections.push({ header: 'Summary', items: summaryItems });

  const title =
    result.failing === 0
      ? '✅ All Tests Passed'
      : `❌ ${result.failing} Package(s) with Test Failures`;

  ui?.success?.('Test run completed', {
    title,
    sections,
  });
}
