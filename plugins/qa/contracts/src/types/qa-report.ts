// CheckType is now `string`
import type { BaselineDiff } from './baseline.js';

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
 * Full QA report — returned by json reporter.
 */
export interface QAReport {
  status: 'passed' | 'failed';
  timestamp: string;
  summary: Record<string, ReportSummary>;
  failures: Record<string, string[]>;
  errors: Record<string, Record<string, string>>;
  baseline: BaselineDiff | null;
}
