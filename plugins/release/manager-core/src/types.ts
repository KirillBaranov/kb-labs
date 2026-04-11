/**
 * Core types for @kb-labs/release-manager-core
 */

export type ReleaseStage = 'planning' | 'checking' | 'versioning' | 'publishing' | 'verifying' | 'rollback';

export type VersionBump = 'patch' | 'minor' | 'major' | 'auto';

export interface ReleaseContext {
  repo: string;
  cwd: string;
  branch: string;
  profile?: string;
  dryRun?: boolean;
}

export interface PackageVersion {
  name: string;
  path: string;
  currentVersion: string;
  nextVersion: string;
  bump: VersionBump;
  isPublished: boolean;
  dependencies?: string[];
}

export interface ReleasePlan {
  packages: PackageVersion[];
  strategy: 'semver';
  registry: string;
  rollbackEnabled: boolean;
}

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  details?: unknown;
  hint?: string;
  timingMs?: number;
}

// CheckId is now dynamic - any string is allowed
export type CheckId = string;

/**
 * Custom check configuration
 * Allows defining checks declaratively through config
 */
export interface CustomCheckConfig {
  id: string;
  /** Human-readable name shown in UI. Falls back to id if not set. */
  name?: string;
  command: string;
  args?: string[];
  parser?: 'json' | 'exitcode' | ((stdout: string, stderr: string, exitCode: number) => boolean);
  timeoutMs?: number;
  optional?: boolean;
  /**
   * Run this check once in a single directory instead of once per package.
   * "repoRoot" — run in the git repo root (default for monorepo builds)
   * "scopePath" — run in the scope directory (monorepo root like kb-labs-core/)
   * If omitted, check runs in each package directory (original behaviour).
   */
  runIn?: 'repoRoot' | 'scopePath' | 'perPackage';
}

export interface ReleaseResult {
  ok: boolean;
  version?: string;
  published?: string[];
  skipped?: string[];
  changelog?: string;
  checks?: Partial<Record<CheckId, CheckResult>>;
  checksPerPackage?: Record<string, Partial<Record<CheckId, CheckResult>>>;
  versionUpdates?: Array<{
    package: string;
    from: string;
    to: string;
    updated: boolean;
  }>;
  git?: {
    committed: boolean;
    tagged: string[];
    pushed: boolean;
  };
  timingMs: number;
  errors?: string[];
}

export interface ReleaseReport {
  schemaVersion: '1.0';
  ts: string;
  context: ReleaseContext;
  stage: ReleaseStage;
  plan?: ReleasePlan;
  result: ReleaseResult;
}

export interface PackagesFilter {
  /** Glob dirs to scan, e.g. ['packages/*', 'apps/*'].
   *  Defaults to full tree scan when omitted. */
  paths?: string[];
  /** If set — only packages matching any pattern are included. */
  include?: string[];
  /** Packages matching any pattern are excluded (applied after include). */
  exclude?: string[];
}

export interface ReleaseConfig {
  registry?: string;
  strategy?: 'semver';
  bump?: VersionBump;
  versioningStrategy?: 'lockstep' | 'independent' | 'adaptive';
  strict?: boolean;
  verify?: CheckId[];
  checks?: CustomCheckConfig[];
  publish?: {
    npm?: boolean;
    github?: boolean;
    /** npm publish --access. Default: 'public'. */
    access?: 'public' | 'restricted';
    /** Package manager to use for publishing. Default: 'pnpm'. */
    packageManager?: 'pnpm' | 'npm' | 'yarn';
  };
  /** Filter which packages are discovered and released. */
  packages?: PackagesFilter;
  /** Per-scope overrides — packages filter merged with global, checks replace global entirely. */
  scopes?: Record<string, {
    packages?: PackagesFilter;
    /** If set, replaces global `checks` for this scope. */
    checks?: CustomCheckConfig[];
  }>;
  rollback?: {
    enabled?: boolean;
    maxHistory?: number;
  };
  output?: {
    json?: boolean;
    md?: boolean;
    text?: boolean;
  };
  changelog?: {
    enabled?: boolean;
    includeTypes?: string[];
    excludeTypes?: string[];
    ignoreAuthors?: string[];
    scopeMap?: Record<string, string>;
    collapseMerges?: boolean;
    collapseReverts?: boolean;
    preferMergeSummary?: boolean;
    bumpStrategy?: 'independent' | 'ripple' | 'lockstep';
    workspace?: boolean;
    perPackage?: boolean;
    format?: 'json' | 'md' | 'both';
    level?: 'compact' | 'standard' | 'detailed';
    template?: string | null;
    locale?: 'en' | 'ru';
    cache?: boolean;
    requireAudit?: boolean;
    requireSignedTags?: boolean;
    redactPatterns?: string[];
    maxBodyLength?: number;
    stabilityGuards?: {
      experimental?: { allowMajor?: boolean };
    };
    ignoreSubmodules?: boolean;
    metadata?: Record<string, unknown>;
  };
  git?: {
    provider?: 'auto' | 'github' | 'gitlab' | 'generic';
    baseUrl?: string | null;
    autoUnshallow?: boolean;
    requireSignedTags?: boolean;
  };
}

export interface AuditSummary {
  ok: boolean;
  checks: Partial<Record<string, { ok: boolean; code?: string; hint?: string }>>;
  overall?: { ok: boolean; failReasons: string[] };
}

// ─── Pipeline interfaces ─────────────────────────────────────────────────────

export interface BuildResult {
  name: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface VerifyResult {
  name: string;
  success: boolean;
  issues: string[];
}

export interface PublishablePackage {
  name: string;
  version: string;
  path: string;
}

export interface PublishResult {
  published: string[];
  skipped: string[];
  errors: string[];
}

/** Injected by CLI (OTP) or REST (token-based) */
export interface PackagePublisher {
  publish(packages: PublishablePackage[], options: { dryRun?: boolean; access?: string }): Promise<PublishResult>;
}

/** Injected by caller — generates changelog */
export interface ChangelogGenerator {
  generate(plan: ReleasePlan, options: {
    repoRoot: string;
    gitCwd: string;
    config: ReleaseConfig;
  }): Promise<string>;
}

export interface PipelineOptions {
  cwd: string;
  repoRoot: string;
  /** Resolved absolute path to the monorepo being released (e.g. infra/kb-labs-adapters).
   *  Planner uses this as cwd for package discovery. */
  scopeCwd: string;
  /** Original scope name for display/reporting only */
  scope?: string;
  config: ReleaseConfig;
  dryRun?: boolean;
  skipChecks?: boolean;
  skipBuild?: boolean;
  skipVerify?: boolean;

  /** Custom check configs from kb.config.json */
  checks?: CustomCheckConfig[];

  /** Injected publisher (CLI = interactive OTP, REST = programmatic token) */
  publisher: PackagePublisher;

  /** Injected changelog generator (with or without LLM) */
  changelog?: ChangelogGenerator;

  /** Pass --no-verify to git push and pushTags. Default: false (hooks run normally). */
  noVerify?: boolean;

  logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
  onProgress?: (stage: ReleaseStage, message: string) => void;
}

export interface PipelineResult {
  success: boolean;
  report: ReleaseReport;
  plan: ReleasePlan;
}

