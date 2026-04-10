// CheckType is now `string`

/**
 * Per-package status across all check types.
 */
export interface PackageStatus {
  name: string;
  repo: string;
  category: string;
  checks: Record<string, 'passed' | 'failed' | 'skipped'>;
  errors: Record<string, string>;
}

/**
 * Results grouped by category → repo → packages.
 */
export interface GroupedResults {
  categories: Record<string, CategoryGroup>;
}

/**
 * A single category group with its repos and summary.
 */
export interface CategoryGroup {
  label: string;
  repos: Record<string, RepoGroup>;
  summary: GroupSummary;
}

/**
 * A single repo group with its packages and summary.
 */
export interface RepoGroup {
  packages: PackageStatus[];
  summary: GroupSummary;
}

/**
 * Summary counts at category or repo level.
 */
export interface GroupSummary {
  total: number;
  /** Packages where all checks passed */
  passed: number;
  /** Packages where at least one check failed */
  failed: number;
  checks: Record<string, { passed: number; failed: number; skipped: number }>;
}
