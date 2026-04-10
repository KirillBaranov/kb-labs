import type { SubmoduleInfo } from './submodule.js';

/**
 * A single history entry — one QA run saved to history.
 */
export interface HistoryEntry {
  timestamp: string;
  git: {
    commit: string;
    branch: string;
    message: string;
  };
  /** Per-repo submodule git state at time of run */
  submodules?: Record<string, SubmoduleInfo>;
  status: 'passed' | 'failed';
  summary: Record<string, { passed: number; failed: number; skipped: number }>;
  failedPackages: Record<string, string[]>;
}

/**
 * Trend analysis result for a single check type.
 */
export interface TrendResult {
  checkType: string;
  /** Display label */
  label?: string;
  /** Display icon (emoji) */
  icon?: string;
  /** Failure count at start of window */
  previous: number;
  /** Failure count at end of window */
  current: number;
  /** Net change (positive = regression) */
  delta: number;
  trend: 'regression' | 'improvement' | 'no-change';
}

/**
 * A single time-series data point for enriched trends.
 */
export interface TrendTimeSeriesPoint {
  timestamp: string;
  gitCommit: string;
  gitBranch: string;
  gitMessage: string;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * A changelog entry describing what changed between two consecutive QA runs.
 */
export interface TrendChangelogEntry {
  timestamp: string;
  gitCommit: string;
  gitMessage: string;
  newFailures: string[];
  fixed: string[];
  delta: number;
}

/**
 * Enriched trend analysis result for a single check type.
 * Provides full time-series data, per-entry changelog, and velocity metrics.
 */
export interface EnrichedTrendResult {
  checkType: string;
  /** Display label */
  label?: string;
  /** Display icon (emoji) */
  icon?: string;
  /** All data points in the window (for time-series chart) */
  timeSeries: TrendTimeSeriesPoint[];
  /** What changed between consecutive entries */
  changelog: TrendChangelogEntry[];
  /** Failure count at start of window */
  current: number;
  /** Failure count at end of window */
  previous: number;
  /** Net change (positive = regression) */
  delta: number;
  trend: 'regression' | 'improvement' | 'no-change';
  /** Average delta per entry (velocity of change) */
  velocity: number;
}

/**
 * Regression detection result.
 */
export interface RegressionResult {
  hasRegressions: boolean;
  regressions: Array<{
    checkType: string;
    delta: number;
    newFailures: string[];
  }>;
}
