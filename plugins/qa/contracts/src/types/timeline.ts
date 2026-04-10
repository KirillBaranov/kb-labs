// CheckType is now `string`

/**
 * A single entry in a package's QA timeline.
 */
export interface PackageTimelineEntry {
  /** Timestamp of the QA run */
  timestamp: string;
  /** Root git info at time of run */
  git: { commit: string; branch: string; message: string };
  /** Submodule commit hash (if available) */
  submoduleCommit?: string;
  /** Per-check status for this package */
  checks: Record<string, 'passed' | 'failed' | 'skipped'>;
}

/**
 * Full timeline for a specific package across QA history.
 */
export interface PackageTimelineResponse {
  /** Package name */
  packageName: string;
  /** Repo this package belongs to */
  repo: string;
  /** Timeline entries (newest first) */
  entries: PackageTimelineEntry[];
  /** Flaky score: 0-1, higher = more flaky (flip-flops between pass/fail) */
  flakyScore: number;
  /** Which check types exhibit flaky behavior */
  flakyChecks: string[];
  /** When this package first appeared in failed state */
  firstFailure?: string;
  /** Current streak (passing or failing, and how many consecutive runs) */
  currentStreak: { status: 'passing' | 'failing'; count: number };
}
