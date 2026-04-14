import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { findRepoRoot } from '@kb-labs/core-sys'

import type {
  PlatformRootResolution,
  ProjectRootResolution,
  ResolvePlatformRootOptions,
  ResolveProjectRootOptions,
  ResolveRootsOptions,
  ResolveWorkspaceRootOptions,
  RootsResolution,
  WorkspaceFs,
  WorkspaceRootResolution,
} from './types'

/**
 * Filenames probed when looking for a project config. Both variants are
 * accepted because `loadPlatformConfig` reads either one.
 */
const PROJECT_CONFIG_FILENAMES = ['kb.config.jsonc', 'kb.config.json'] as const

/**
 * Package markers used to recognise an installed KB Labs platform. Any one of
 * these, when present as `<root>/node_modules/<marker>`, indicates that
 * `<root>` is a platform installation.
 */
const PLATFORM_PACKAGE_MARKERS = [
  '@kb-labs/cli-bin',
  '@kb-labs/core-runtime',
] as const

const defaultFs: WorkspaceFs = {
  async exists(target: string): Promise<boolean> {
    try {
      await fsp.access(target)
      return true
    } catch {
      return false
    }
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Project root (previously "workspace root")
// ──────────────────────────────────────────────────────────────────────────

function resolveProjectEnvRoot(
  env: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!env) {
    return undefined
  }
  return (
    env.KB_PROJECT_ROOT ??
    env.KB_LABS_WORKSPACE_ROOT ??
    env.KB_LABS_REPO_ROOT
  )
}

/**
 * Walk up from `startDir` looking for a directory that contains
 * `.kb/kb.config.jsonc` or `.kb/kb.config.json`. Returns the first match, or
 * `undefined` if none is found before the filesystem root.
 *
 * This is the canonical "is this a project?" probe — exported so CLI
 * commands, discovery, and scope-aware code can share the same rules the
 * config loader uses.
 */
export async function findProjectConfigRoot(
  startDir: string,
  fs: WorkspaceFs = defaultFs,
): Promise<string | undefined> {
  let current = path.resolve(startDir)

  while (true) {
    for (const name of PROJECT_CONFIG_FILENAMES) {
      const configPath = path.join(current, '.kb', name)
      // eslint-disable-next-line no-await-in-loop -- Sequential walk is intentional
      if (await fs.exists(configPath)) {
        return current
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }

    current = parent
  }
}

/**
 * Resolve the project root — the directory that contains the user's
 * `.kb/kb.config.json` and plugin state.
 *
 * Priority order:
 *
 * 1. Explicit `cwd` option (e.g. CLI flag).
 * 2. Environment variables: `KB_PROJECT_ROOT` (preferred), then the legacy
 *    `KB_LABS_WORKSPACE_ROOT` / `KB_LABS_REPO_ROOT`.
 * 3. Nearest `.kb/kb.config.json` ancestor walking up from `startDir`.
 * 4. Repository root discovered via `findRepoRoot` (pnpm workspace, `.git`,
 *    `package.json`).
 * 5. Fallback to `startDir` / `process.cwd()`.
 *
 * In monorepo dev mode this typically returns the workspace root. In installed
 * mode it returns the user's project directory.
 */
export async function resolveProjectRoot(
  options: ResolveProjectRootOptions = {},
): Promise<ProjectRootResolution> {
  const {
    cwd,
    env = process.env,
    fs = defaultFs,
    startDir = process.cwd(),
  } = options

  if (cwd) {
    return {
      rootDir: path.resolve(cwd),
      source: 'explicit',
    }
  }

  const envRoot = resolveProjectEnvRoot(env)
  if (envRoot) {
    return {
      rootDir: path.resolve(envRoot),
      source: 'env',
    }
  }

  const configRoot = await findProjectConfigRoot(startDir, fs)
  if (configRoot) {
    return {
      rootDir: configRoot,
      source: 'config',
    }
  }

  try {
    const repoRoot = await findRepoRoot(startDir)
    const resolvedRepo = path.resolve(repoRoot)
    const fsRoot = path.parse(resolvedRepo).root

    if (resolvedRepo !== fsRoot) {
      return {
        rootDir: resolvedRepo,
        source: 'repo',
      }
    }
  } catch {
    // swallow and fall through to fallback
  }

  return {
    rootDir: path.resolve(startDir),
    source: 'fallback',
  }
}

/**
 * @deprecated Use {@link resolveProjectRoot}. This alias is kept for
 * backwards compatibility; semantics are identical.
 *
 * The name "workspace root" is ambiguous — in KB Labs terminology, what it
 * actually refers to is the project root (where `.kb/kb.config.json` lives),
 * not the KB Labs platform installation. Prefer the explicit name.
 */
export async function resolveWorkspaceRoot(
  options: ResolveWorkspaceRootOptions = {},
): Promise<WorkspaceRootResolution> {
  return resolveProjectRoot(options)
}

// ──────────────────────────────────────────────────────────────────────────
// Platform root
// ──────────────────────────────────────────────────────────────────────────

/**
 * Check whether `<candidate>/node_modules/<marker>` exists for any of the
 * known platform package markers.
 *
 * Candidates inside a pnpm virtual store (paths containing `/.pnpm/`) are
 * deliberately ignored: pnpm's virtual store nests `node_modules` trees
 * that look identical to a real platform install, and walking up from a
 * bin.js that pnpm resolved through the store would otherwise stop inside
 * the store at e.g. `.pnpm/@kb-labs+cli-bin@2.5.0_.../node_modules/@kb-labs/cli-bin`
 * instead of the real platform root that owns the hoisted symlinks.
 */
async function hasPlatformMarker(
  candidate: string,
  fs: WorkspaceFs,
): Promise<boolean> {
  if (isInsidePnpmStore(candidate)) {
    return false
  }
  for (const marker of PLATFORM_PACKAGE_MARKERS) {
    const markerPath = path.join(candidate, 'node_modules', marker)
    // eslint-disable-next-line no-await-in-loop -- Sequential probe is intentional
    if (await fs.exists(markerPath)) {
      return true
    }
  }
  return false
}

/**
 * Returns true if `candidate` is located inside a pnpm virtual store
 * (i.e. its path contains a `/.pnpm/` segment). Such candidates should
 * never be treated as a platform root during walk-up because they live
 * inside the store of whichever real platform root hoists them.
 */
function isInsidePnpmStore(candidate: string): boolean {
  // Use path separators so we don't match literal `.pnpm` directory names
  // at the beginning or end of the path (unlikely but cheap to be strict).
  const sep = path.sep
  return candidate.includes(`${sep}.pnpm${sep}`)
}

/**
 * Walk up from `startDir` looking for either a platform marker
 * (`node_modules/@kb-labs/*`) or a pnpm workspace marker
 * (`pnpm-workspace.yaml`). Returns the first match.
 *
 * Exported so CLI/diagnostics code can identify the platform root without
 * paying for the full composite `resolvePlatformRoot` fallback chain.
 */
export async function findPlatformMarkerRoot(
  startDir: string,
  fs: WorkspaceFs = defaultFs,
): Promise<string | undefined> {
  let current = path.resolve(startDir)

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- Sequential walk is intentional
    if (await hasPlatformMarker(current, fs)) {
      return current
    }

    // eslint-disable-next-line no-await-in-loop -- Sequential walk is intentional
    if (await fs.exists(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

/**
 * Given a `file://` URL (typically `import.meta.url` from a CLI entry or
 * service bootstrap), walk up through its directory ancestors to locate the
 * platform installation root.
 *
 * Two signals are collected on the way up:
 *
 * 1. **First platform-package marker hit** — a directory whose `node_modules`
 *    contains `@kb-labs/cli-bin` (or another known platform marker). In
 *    installed mode this is the platform installation directory.
 *
 * 2. **Top-most `pnpm-workspace.yaml`** — we keep walking past inner workspace
 *    markers and record the *outermost* one. This is important in the
 *    KB Labs "workspace of workspaces" dev layout, where individual sub-repos
 *    (`platform/kb-labs-cli`, `plugins/kb-labs-*`, etc.) each have their own
 *    `pnpm-workspace.yaml` while the true monorepo root lives at the very top.
 *
 * Precedence after walking: the outermost `pnpm-workspace.yaml` wins if one
 * exists (dev mode); otherwise we return the first marker hit (installed
 * mode). This way a naive walk-up can never stop prematurely at a nested
 * workspace or at a package with its own hoisting symlink.
 */
async function resolvePlatformRootFromModuleUrl(
  moduleUrl: string,
  fs: WorkspaceFs,
): Promise<string | undefined> {
  let modulePath: string
  try {
    modulePath = fileURLToPath(moduleUrl)
  } catch {
    return undefined
  }

  let current = path.dirname(modulePath)
  let firstMarkerHit: string | undefined
  let topMostWorkspace: string | undefined

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- Sequential walk is intentional
    if (!firstMarkerHit && (await hasPlatformMarker(current, fs))) {
      firstMarkerHit = current
    }

    // Keep overwriting: we want the *outermost* (highest-up) workspace root,
    // not the innermost. This handles the KB Labs nested-workspaces layout.
    // eslint-disable-next-line no-await-in-loop -- Sequential walk is intentional
    if (await fs.exists(path.join(current, 'pnpm-workspace.yaml'))) {
      topMostWorkspace = current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      // Reached filesystem root. Prefer top-most workspace (dev mode);
      // otherwise return first marker hit (installed mode).
      return topMostWorkspace ?? firstMarkerHit
    }
    current = parent
  }
}

/**
 * Resolve the platform root — the directory that contains the installed
 * KB Labs platform code (i.e. the parent of `node_modules/@kb-labs/*`).
 *
 * Priority order:
 *
 * 1. Explicit `cwd` option (e.g. CLI flag).
 * 2. Environment variable `KB_PLATFORM_ROOT` (typically set by the installer
 *    wrapper script in installed mode).
 * 3. Walk up from `moduleUrl` (e.g. `import.meta.url` of the CLI `bin.ts`),
 *    looking for a directory whose `node_modules` contains a known platform
 *    package. This is the most reliable signal in installed mode because it
 *    does not depend on `process.cwd()`.
 * 4. Walk up from `startDir` looking for either a platform marker or
 *    `pnpm-workspace.yaml` (the latter covers monorepo dev mode).
 * 5. Repository root discovered via `findRepoRoot`.
 * 6. Fallback to `startDir` / `process.cwd()`.
 *
 * In monorepo dev mode steps 4 or 5 will typically match the workspace root,
 * so `platformRoot` and `projectRoot` resolve to the same directory.
 */
export async function resolvePlatformRoot(
  options: ResolvePlatformRootOptions = {},
): Promise<PlatformRootResolution> {
  const {
    cwd,
    moduleUrl,
    env = process.env,
    fs = defaultFs,
    startDir = process.cwd(),
  } = options

  if (cwd) {
    return {
      rootDir: path.resolve(cwd),
      source: 'explicit',
    }
  }

  const envRoot = env?.KB_PLATFORM_ROOT
  if (envRoot) {
    return {
      rootDir: path.resolve(envRoot),
      source: 'env',
    }
  }

  if (moduleUrl) {
    const fromModule = await resolvePlatformRootFromModuleUrl(moduleUrl, fs)
    if (fromModule) {
      return {
        rootDir: fromModule,
        source: 'module',
      }
    }
  }

  const fromMarker = await findPlatformMarkerRoot(startDir, fs)
  if (fromMarker) {
    return {
      rootDir: fromMarker,
      source: 'marker',
    }
  }

  try {
    const repoRoot = await findRepoRoot(startDir)
    const resolvedRepo = path.resolve(repoRoot)
    const fsRoot = path.parse(resolvedRepo).root

    if (resolvedRepo !== fsRoot) {
      return {
        rootDir: resolvedRepo,
        source: 'repo',
      }
    }
  } catch {
    // swallow and fall through to fallback
  }

  return {
    rootDir: path.resolve(startDir),
    source: 'fallback',
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Composite resolver
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve both the platform root and the project root in a single call. This
 * is the main entry point for the CLI, service bootstrap, and `kb-dev`.
 *
 * @example
 * ```ts
 * // In bin.ts (the CLI entrypoint):
 * const { platformRoot, projectRoot } = await resolveRoots({
 *   moduleUrl: import.meta.url,
 *   startDir: process.cwd(),
 * })
 * ```
 *
 * In dev mode `platformRoot === projectRoot` and `sameLocation` is `true`.
 * In installed mode they differ: `platformRoot` points at the platform
 * installation while `projectRoot` points at the user's project directory.
 */
export async function resolveRoots(
  options: ResolveRootsOptions = {},
): Promise<RootsResolution> {
  const [platform, project] = await Promise.all([
    resolvePlatformRoot(options),
    resolveProjectRoot(options),
  ])

  return {
    platformRoot: platform.rootDir,
    projectRoot: project.rootDir,
    sameLocation:
      path.resolve(platform.rootDir) === path.resolve(project.rootDir),
    sources: {
      platform: platform.source,
      project: project.source,
    },
  }
}
