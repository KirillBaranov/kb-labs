/**
 * QA Plugin configuration.
 * Stored in kb.config.json → profiles[].products.qa
 */

/**
 * A single QA check definition — command to run, where, and how to evaluate.
 */
export interface QACheckConfig {
  /** Unique check identifier (e.g. "build", "lint", "typecheck", "test") */
  id: string;
  /** Display name. Defaults to id if not set. */
  name?: string;
  /** Command to execute (e.g. "pnpm", "go", "bash") */
  command: string;
  /** Arguments passed to command (e.g. ["run", "build"]) */
  args?: string[];
  /**
   * How to evaluate the result.
   * - "exitcode" (default): exit 0 = pass
   * - "json": parse stdout as JSON, pass if .ok === true or .success === true or .status === "ok"
   */
  parser?: 'exitcode' | 'json';
  /** Timeout in ms. Default: 120000 (2 min) */
  timeoutMs?: number;
  /** If true, failure does not block the overall QA run */
  optional?: boolean;
  /**
   * If true, sort packages by dependency order (topological sort) before running.
   * Ensures upstream packages are processed first so their build artifacts (e.g. .d.ts)
   * are available for downstream packages. Useful for build checks.
   */
  ordered?: boolean;
  /**
   * Where to execute the command:
   * - "perPackage" (default): run in each discovered package directory
   * - "scopePath": run once in the sub-repo root (e.g. platform/kb-labs-cli/)
   * - "repoRoot": run once in the workspace root
   */
  runIn?: 'perPackage' | 'scopePath' | 'repoRoot';
  /** Display icon (emoji, e.g. "🔒"). Used in CLI output and REST API. */
  icon?: string;
}

/**
 * Filter which packages are discovered and checked.
 */
export interface PackagesConfig {
  /**
   * Glob patterns for sub-repo directories to scan, relative to workspace root.
   * E.g. ["platform/*", "plugins/*", "infra/*"].
   * Each matched directory is checked for pnpm-workspace.yaml.
   * Defaults to auto-scan if omitted.
   */
  paths?: string[];
  /** Include only packages whose name matches any of these patterns. Applied after discovery. */
  include?: string[];
  /** Exclude packages whose name matches any of these patterns. Applied after include. */
  exclude?: string[];
}

export interface QAPluginConfig {
  /** Control which packages are discovered and checked. */
  packages?: PackagesConfig;
  /**
   * Checks to run. If omitted, falls back to built-in runners (build/lint/typeCheck/test).
   * Each check is executed per package or per scope depending on runIn.
   */
  checks?: QACheckConfig[];
  /**
   * Per-scope overrides. Key is a relative path or sub-repo name (e.g. "platform/kb-labs-cli").
   * scope.checks replaces global checks entirely (no merging).
   */
  scopes?: Record<string, {
    packages?: PackagesConfig;
    checks?: QACheckConfig[];
  }>;
  /** Package categories for grouped reporting */
  categories?: Record<string, CategoryConfig>;
}

/**
 * Configuration for a single package category.
 */
export interface CategoryConfig {
  /** Display name (defaults to category key if not set) */
  label?: string;
  /** Package name patterns: exact name, glob ("@kb-labs/core-*"), or repo prefix ("kb-labs-cli/*") */
  packages: string[];
}
