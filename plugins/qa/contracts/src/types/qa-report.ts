// CheckType is now `string`
import type { BaselineDiff } from './baseline.js';
import type { CheckItem } from './check-output.js';

/**
 * Summary section of a QA report.
 */
export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * A grouped set of findings for one check in the agent-facing report.
 */
export interface ReportCheckFindings {
  check: string;
  items: CheckItem[];
}

/**
 * Full QA report — returned by json reporter.
 */
export interface QAReport {
  status: 'passed' | 'failed';
  timestamp: string;
  summary: Record<string, ReportSummary>;
  failures: Record<string, string[]>;
  errors: Record<string, Record<string, string>>;
  baseline: BaselineDiff | null;
  /**
   * Blocker findings — checks with severity:"blocker" (default) that failed.
   * Each entry has structured CheckItem[] for the agent to act on.
   */
  blockers: ReportCheckFindings[];
  /**
   * Warning findings — checks with severity:"warning" that failed.
   * Does not affect overall status, but agent should review.
   */
  warnings: ReportCheckFindings[];
}
