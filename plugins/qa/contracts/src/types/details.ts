// CheckType is now `string`
import type { SubmoduleInfo } from './submodule.js';

/**
 * Per-package detail for a single check type.
 */
export interface PackageCheckDetail {
  /** Package name (e.g. "@kb-labs/mind-engine") */
  name: string;
  /** Repo / submodule name (e.g. "kb-labs-mind") */
  repo: string;
  /** Check status for this package */
  status: 'passed' | 'failed' | 'skipped';
  /** Error output (only if failed, truncated to 2000 chars) */
  error?: string;
  /** Git submodule info for this package's repo */
  submodule?: SubmoduleInfo;
}

/**
 * Full details of the last QA run, per-package breakdown.
 */
export interface QADetailsResponse {
  /** Timestamp of the last run (null if no data) */
  timestamp: string | null;
  /** Root git info */
  git: { commit: string; branch: string; message: string } | null;
  /** Per-repo submodule state at time of run */
  submodules?: Record<string, SubmoduleInfo>;
  /** Per-check-type breakdown with package details */
  checks: Record<string, {
    passed: PackageCheckDetail[];
    failed: PackageCheckDetail[];
    skipped: PackageCheckDetail[];
  }>;
}
