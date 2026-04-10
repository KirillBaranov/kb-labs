import type { SubmoduleInfo } from './submodule.js';
import type { PackagesConfig, QACheckConfig } from './config.js';

/**
 * Types of checks the QA plugin can run.
 */
export type CheckType = string;

/**
 * Result of a single check type across all packages.
 */
export interface CheckResult {
  /** Packages that passed this check */
  passed: string[];
  /** Packages that failed this check */
  failed: string[];
  /** Packages that were skipped (up-to-date / excluded) */
  skipped: string[];
  /** Error messages keyed by package name */
  errors: Record<string, string>;
}

/**
 * Combined results of all QA check types.
 */
export type QAResults = Record<string, CheckResult>;

/**
 * Options for running QA checks.
 */
export interface QARunOptions {
  /** Root directory of the monorepo */
  rootDir: string;
  /** Skip specific check IDs (e.g. ['build', 'lint', 'typecheck', 'test']) */
  skipChecks?: string[];
  /** Disable caching (force full run) */
  noCache?: boolean;
  /** Run all packages, ignoring affected analysis */
  all?: boolean;
  /** Filter by package name */
  package?: string;
  /** Filter by repo name */
  repo?: string;
  /** Filter by npm scope */
  scope?: string;
  /** Package discovery config (paths/include/exclude from kb.config.json) */
  packagesConfig?: PackagesConfig;
  /** Custom checks to run. If provided, replaces built-in runners (build/lint/typeCheck/test). */
  checks?: QACheckConfig[];
  /** Progress callback (durationMs is set for executed checks, undefined for skipped) */
  onProgress?: (phase: string, pkg: string, status: 'pass' | 'fail' | 'skip', durationMs?: number) => void;
}

/**
 * Package filter criteria.
 */
export interface PackageFilter {
  package?: string;
  repo?: string;
  scope?: string;
}

/**
 * Workspace package metadata.
 */
export interface WorkspacePackage {
  /** Package name from package.json */
  name: string;
  /** Absolute path to package directory */
  dir: string;
  /** Relative path from root */
  relativePath: string;
  /** The repo/monorepo this package belongs to */
  repo: string;
  /** Git submodule info for this package's repo */
  submodule?: SubmoduleInfo;
}

/**
 * Extended QA run result with package metadata preserved.
 */
export interface QARunResult {
  results: QAResults;
  packages: WorkspacePackage[];
}
