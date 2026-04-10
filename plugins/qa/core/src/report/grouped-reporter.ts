import type {
  QAResults,
  WorkspacePackage,
  QAPluginConfig,
  PackageStatus,
  GroupedResults,
  GroupSummary,
} from '@kb-labs/qa-contracts';

function emptyGroupSummary(checkTypes: string[]): GroupSummary {
  const checks = {} as GroupSummary['checks'];
  for (const ct of checkTypes) {
    checks[ct] = { passed: 0, failed: 0, skipped: 0 };
  }
  return { total: 0, passed: 0, failed: 0, checks };
}

function resolveCheckStatus(
  pkgName: string,
  ct: string,
  results: QAResults,
): 'passed' | 'failed' | 'skipped' {
  const r = results[ct];
  if (!r) {return 'skipped';}
  if (r.failed.includes(pkgName)) {return 'failed';}
  if (r.passed.includes(pkgName)) {return 'passed';}
  return 'skipped';
}

/**
 * Build per-package status from QA results.
 */
function buildPackageStatus(
  pkg: WorkspacePackage,
  results: QAResults,
  category: string,
): PackageStatus {
  const checks = {} as PackageStatus['checks'];
  const errors: Record<string, string> = {};

  for (const ct of Object.keys(results)) {
    checks[ct] = resolveCheckStatus(pkg.name, ct, results);
    if (checks[ct] === 'failed' && results[ct]?.errors[pkg.name]) {
      errors[ct] = results[ct]!.errors[pkg.name]!;
    }
  }

  return {
    name: pkg.name,
    repo: pkg.repo,
    category,
    checks,
    errors,
  };
}

/**
 * Add a PackageStatus to a GroupSummary.
 */
function addToSummary(summary: GroupSummary, status: PackageStatus): void {
  summary.total++;

  const hasFail = Object.values(status.checks).some((v) => v === 'failed');
  if (hasFail) {
    summary.failed++;
  } else {
    summary.passed++;
  }

  for (const ct of Object.keys(status.checks)) {
    const s = status.checks[ct];
    if (!summary.checks[ct]) {
      summary.checks[ct] = { passed: 0, failed: 0, skipped: 0 };
    }
    if (s === 'passed') {summary.checks[ct].passed++;}
    else if (s === 'failed') {summary.checks[ct].failed++;}
    else {summary.checks[ct].skipped++;}
  }
}

/**
 * Group QA results by category → repo → packages.
 *
 * A package can appear in multiple categories if its repo is listed
 * in multiple category configs (e.g., kb-labs-cli in both "core" and "hosts").
 */
export function groupResults(
  results: QAResults,
  packages: WorkspacePackage[],
  categoryMap: Map<string, string[]>,
  config?: QAPluginConfig,
): GroupedResults {
  const checkTypes = Object.keys(results);
  const grouped: GroupedResults = { categories: {} };

  for (const pkg of packages) {
    const categoryKeys = categoryMap.get(pkg.name) ?? ['uncategorized'];

    for (const categoryKey of categoryKeys) {
      const status = buildPackageStatus(pkg, results, categoryKey);

      // Ensure category exists
      if (!grouped.categories[categoryKey]) {
        const label =
          categoryKey === 'uncategorized'
            ? 'Uncategorized'
            : config?.categories?.[categoryKey]?.label ?? categoryKey;

        grouped.categories[categoryKey] = {
          label,
          repos: {},
          summary: emptyGroupSummary(checkTypes),
        };
      }

      const categoryGroup = grouped.categories[categoryKey]!;

      // Ensure repo exists within category
      if (!categoryGroup.repos[pkg.repo]) {
        categoryGroup.repos[pkg.repo] = {
          packages: [],
          summary: emptyGroupSummary(checkTypes),
        };
      }

      const repoGroup = categoryGroup.repos[pkg.repo]!;

      repoGroup.packages.push(status);
      addToSummary(repoGroup.summary, status);
      addToSummary(categoryGroup.summary, status);
    }
  }

  return grouped;
}
