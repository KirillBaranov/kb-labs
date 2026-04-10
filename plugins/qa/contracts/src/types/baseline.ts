// CheckType is now `string` — import kept for documentation

/**
 * Git metadata captured at baseline time.
 */
export interface GitInfo {
  commit: string;
  branch: string;
}

/**
 * Snapshot of a single check type in the baseline.
 */
export interface BaselineCheckSnapshot {
  passed: number;
  failed: number;
  failedPackages: string[];
}

/**
 * A full baseline snapshot — the "known state" of QA for comparison.
 */
export interface BaselineSnapshot {
  timestamp: string;
  git: GitInfo;
  results: Record<string, BaselineCheckSnapshot>;
}

/**
 * Diff for a single check type between current run and baseline.
 */
export interface CheckDiff {
  /** Packages that newly failed (weren't in baseline) */
  newFailures: string[];
  /** Packages that were fixed (were in baseline, now passing) */
  fixed: string[];
  /** Packages still failing (in both baseline and current) */
  stillFailing: string[];
  /** Net change in failure count (positive = regression) */
  delta: number;
}

/**
 * Full diff across all check types.
 */
export type BaselineDiff = Record<string, CheckDiff>;
