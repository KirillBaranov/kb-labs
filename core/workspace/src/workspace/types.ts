/**
 * @module @kb-labs/core-workspace/types
 *
 * Types for workspace/platform/project root resolution.
 *
 * KB Labs distinguishes **two** logical roots:
 *
 * - **platformRoot** — the directory that contains the installed KB Labs
 *   platform code (i.e. the parent of `node_modules/@kb-labs/*`). This is the
 *   place from which plugin discovery should scan `node_modules`, and where
 *   cloud/CI deployments may place per-installation platform defaults.
 *
 * - **projectRoot** — the directory that contains the user's `.kb/` folder,
 *   including `.kb/kb.config.json` and any runtime state written by plugins
 *   (`.kb/qa`, `.kb/mind`, `.kb/release`, `.kb/marketplace.lock`, etc.).
 *   This is *where the user is working*.
 *
 * In development (monorepo workspace) mode these two roots typically resolve
 * to the same directory. In installed mode they are different — the platform
 * lives under e.g. `/opt/kb-labs` while the project lives under
 * `~/work/my-app`.
 */

/**
 * Minimal filesystem façade used by the resolvers. Allows tests to inject a
 * virtual filesystem without touching `node:fs` directly.
 */
export interface WorkspaceFs {
  exists(path: string): Promise<boolean>
}

// ──────────────────────────────────────────────────────────────────────────
// resolveProjectRoot / (legacy) resolveWorkspaceRoot
// ──────────────────────────────────────────────────────────────────────────

export type ProjectRootSource =
  | 'explicit'
  | 'env'
  | 'config'
  | 'repo'
  | 'fallback'

export interface ProjectRootResolution {
  rootDir: string
  source: ProjectRootSource
}

export interface ResolveProjectRootOptions {
  /**
   * Explicit root directory to use (e.g. from CLI flag). Highest priority.
   */
  cwd?: string
  /**
   * Starting directory for discovery. Defaults to process.cwd().
   */
  startDir?: string
  /**
   * Environment variables map. Defaults to process.env.
   */
  env?: Record<string, string | undefined>
  /**
   * Optionally inject custom filesystem helpers for testing.
   */
  fs?: WorkspaceFs
  /**
   * When true, includes additional metadata in errors/logs.
   */
  verbose?: boolean
}

/**
 * @deprecated Use {@link ResolveProjectRootOptions}. Alias kept for backwards
 * compatibility with `resolveWorkspaceRoot`.
 */
export type ResolveWorkspaceRootOptions = ResolveProjectRootOptions

/**
 * @deprecated Use {@link ProjectRootResolution}.
 */
export type WorkspaceRootResolution = ProjectRootResolution

// ──────────────────────────────────────────────────────────────────────────
// resolvePlatformRoot
// ──────────────────────────────────────────────────────────────────────────

export type PlatformRootSource =
  | 'explicit'
  | 'env'
  | 'module'
  | 'marker'
  | 'repo'
  | 'fallback'

export interface PlatformRootResolution {
  rootDir: string
  source: PlatformRootSource
}

export interface ResolvePlatformRootOptions {
  /**
   * Explicit root directory to use (e.g. from CLI flag). Highest priority.
   */
  cwd?: string
  /**
   * `import.meta.url` of the calling module (typically the CLI entrypoint or
   * a service bootstrap file). Used to locate the installed
   * `node_modules/@kb-labs/*` tree by walking up from the module's physical
   * location. This is the **most reliable** signal in installed mode because
   * it does not depend on process cwd or directory layout assumptions.
   */
  moduleUrl?: string
  /**
   * Starting directory for marker-based discovery. Defaults to process.cwd().
   */
  startDir?: string
  /**
   * Environment variables map. Defaults to process.env.
   */
  env?: Record<string, string | undefined>
  /**
   * Optionally inject custom filesystem helpers for testing.
   */
  fs?: WorkspaceFs
  /**
   * When true, includes additional metadata in errors/logs.
   */
  verbose?: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// resolveRoots (composite)
// ──────────────────────────────────────────────────────────────────────────

export interface ResolveRootsOptions
  extends ResolvePlatformRootOptions,
    ResolveProjectRootOptions {}

export interface RootsResolution {
  /** Where `node_modules/@kb-labs/*` lives. */
  platformRoot: string
  /** Where `.kb/kb.config.json` and per-project state live. */
  projectRoot: string
  /**
   * `true` when both roots resolve to the same physical directory — this is
   * the normal case in the KB Labs monorepo dev mode.
   */
  sameLocation: boolean
  /** How each root was resolved (for diagnostics). */
  sources: {
    platform: PlatformRootSource
    project: ProjectRootSource
  }
}
