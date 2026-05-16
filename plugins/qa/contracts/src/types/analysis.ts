// Output types from the QA analysis layer

// ── Trend analysis (over RunSnapshot history) ────────────────────────────────

export interface TaskTrendPoint {
  timestamp: string;
  gitCommit: string;
  gitBranch: string;
  gitMessage: string;
  failed: number;
  passed: number;
  cached: number;
  total: number;
}

export interface TaskTrendChangelog {
  timestamp: string;
  gitCommit: string;
  gitMessage: string;
  newFailures: string[];
  fixed: string[];
  delta: number;
}

export interface TaskTrend {
  task: string;
  previous: number;
  current: number;
  delta: number;
  direction: 'regression' | 'improvement' | 'no-change';
  velocity: number;
  timeSeries: TaskTrendPoint[];
  changelog: TaskTrendChangelog[];
}

export interface TrendAnalysis {
  window: number;
  historyCount: number;
  tasks: TaskTrend[];
}

// ── Regression detection (last two RunSnapshots) ─────────────────────────────

export interface RunRegression {
  task: string;
  delta: number;
  newFailures: string[];
}

export interface RegressionDetection {
  hasRegressions: boolean;
  regressions: RunRegression[];
  comparedAt: { previous: string; current: string };
}

// ── Baseline comparison (check + stats diff) ─────────────────────────────────

export interface CheckIssueDiff {
  pkg: string;
  check: string;
  status: 'new' | 'fixed' | 'persisting';
  severity: string;
  message: string;
}

export interface BaselineCheckDiff {
  newIssues: CheckIssueDiff[];
  fixedIssues: CheckIssueDiff[];
  persistingIssues: CheckIssueDiff[];
  newIssueCount: number;
  fixedIssueCount: number;
  scoreDelta: number;
  gradeDelta: string;
}

// ── Package timeline (per-package run history) ───────────────────────────────

export interface PackageTaskHistory {
  timestamp: string;
  gitCommit: string;
  task: string;
  status: 'passed' | 'failed' | 'cached';
}

export interface PackageTimeline {
  packageName: string;
  history: PackageTaskHistory[];
  flakyScore: number;
  flakyTasks: string[];
  currentStreak: { status: 'passing' | 'failing'; count: number };
  firstFailure?: string;
}
