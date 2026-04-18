/**
 * @module @kb-labs/core-runtime/config-loader
 *
 * Shared platform config loader used by both the CLI bootstrap
 * (`@kb-labs/cli-bin`) and service bootstrap (`createServiceBootstrap`).
 *
 * Responsibilities:
 *
 *  - Resolve `platformRoot` and `projectRoot` via `@kb-labs/core-workspace`.
 *    These are *two different logical roots* — see `resolveRoots` docs for
 *    the distinction.
 *
 *  - Load two layers of platform configuration:
 *      1. Platform defaults from `<platformRoot>/.kb/kb.config.json`
 *         (optional — absent in solo dev mode).
 *      2. Project config from `<projectRoot>/.kb/kb.config.json`
 *         (optional — absent when running outside a project).
 *
 *  - Deep-merge the two layers (project overrides platform defaults) using
 *    `mergeDefined` from `@kb-labs/core-config`.
 *
 *  - Optionally load the `.env` file from `projectRoot`.
 *
 * This function deliberately does *not* call `initPlatform` — it only loads
 * and merges configuration. The caller is responsible for initializing the
 * platform with the result:
 *
 * ```ts
 * const { platformConfig, projectRoot } = await loadPlatformConfig({
 *   moduleUrl: import.meta.url,
 *   startDir: process.cwd(),
 * })
 * await initPlatform(platformConfig, projectRoot, uiProvider)
 * ```
 *
 * Keeping load and init separate makes the function trivially testable: we
 * can assert on the merged config without touching the global platform
 * singleton.
 */

import path from 'node:path'
import os from 'node:os'
import { existsSync, readFileSync } from 'node:fs'

import {
  readJsonWithDiagnostics,
  mergeWithFieldPolicy,
  type FieldMergePolicy,
} from '@kb-labs/core-config'
import { resolveRoots, type RootsResolution } from '@kb-labs/core-workspace'

import { CONFIG_FIELD_SCOPE, type PlatformConfig } from './config.js'
import { interpolateConfig } from './config-interpolation.js'

function expandPlatformDir(raw: string, projectRoot: string): string {
  let value = raw.trim()
  if (value.startsWith('~')) {
    value = path.join(os.homedir(), value.slice(1))
  }
  return path.resolve(projectRoot, value)
}

const CONFIG_RELATIVE_PATHS = [
  path.join('.kb', 'kb.config.jsonc'),
  path.join('.kb', 'kb.config.json'),
  'kb.config.jsonc',
  'kb.config.json',
] as const

export interface LoadPlatformConfigOptions {
  /**
   * `import.meta.url` of the calling entrypoint (CLI bin or service entry).
   * Used to locate the installed `node_modules/@kb-labs/*` tree reliably in
   * installed mode. Optional — if omitted, falls back to marker walk-up from
   * `startDir`.
   */
  moduleUrl?: string
  /**
   * Starting directory for project-root discovery. Defaults to
   * `process.cwd()`.
   */
  startDir?: string
  /**
   * Environment variables map. Defaults to `process.env`.
   */
  env?: NodeJS.ProcessEnv
  /**
   * When `true` (default), loads `<projectRoot>/.env` into `process.env`
   * before reading config. Does not override variables already set.
   */
  loadEnvFile?: boolean
}

export interface LoadPlatformConfigResult {
  /**
   * Effective `platform` configuration: project config deep-merged on top of
   * platform defaults. Always defined — an empty object when neither layer
   * provides anything.
   */
  platformConfig: PlatformConfig
  /**
   * Raw contents of the *project* config file, if one was found. Used by the
   * CLI to expose the full user-facing config via `useConfig()`.
   */
  rawConfig?: Record<string, unknown>
  /** Resolved platform root (where `node_modules/@kb-labs/*` lives). */
  platformRoot: string
  /** Resolved project root (where `.kb/kb.config.json` lives). */
  projectRoot: string
  /** `true` when both roots resolve to the same directory (dev mode). */
  sameLocation: boolean
  /** Diagnostics about how each config layer was loaded. */
  sources: {
    /** Absolute path to platform defaults file, if one was loaded. */
    platformDefaults?: string
    /** Absolute path to project config file, if one was loaded. */
    projectConfig?: string
    /** How each root was resolved. */
    roots: RootsResolution['sources']
    /** Per-top-level-field provenance after policy merge. */
    fields?: Record<string, 'platform' | 'project' | 'both'>
    /** Top-level fields where the project layer was rejected as platform-only. */
    ignoredProjectFields?: string[]
    /** Set when project config pointed to a different platformRoot via `platform.dir`. */
    platformDirOverride?: string
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────

function loadEnvFile(dir: string): void {
  const envPath = path.join(dir, '.env')
  if (!existsSync(envPath)) {
    return
  }
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const eq = trimmed.indexOf('=')
      if (eq === -1) {
        continue
      }
      const key = trimmed.substring(0, eq).trim()
      const val = trimmed
        .substring(eq + 1)
        .trim()
        .replace(/^["'](.*?)["']$/, '$1')
        .replace(/^`(.*?)`$/, '$1')
      if (key && !(key in process.env)) {
        process.env[key] = val
      }
    }
  } catch {
    // Silently ignore — not critical for service operation.
  }
}

/**
 * Look for a config file at `<root>/.kb/kb.config.json` or `<root>/kb.config.json`.
 * Returns `undefined` if neither exists.
 */
function findConfigAtRoot(root: string): string | undefined {
  for (const rel of CONFIG_RELATIVE_PATHS) {
    const full = path.join(root, rel)
    if (existsSync(full)) {
      return full
    }
  }
  return undefined
}

/**
 * Read a KB Labs config file and extract its `platform` section. Returns
 * `{ platformSection, rawConfig }` where either field may be `undefined` if
 * the file is missing, malformed, or has no `platform` section.
 *
 * `adapterOptions` lives at the top level of the config file (not inside
 * `platform`), so we merge it into the returned platformSection so that
 * initPlatform receives credentials and adapter-specific options.
 */
async function readConfigFile(configPath: string): Promise<{
  platformSection?: PlatformConfig
  rawConfig?: Record<string, unknown>
}> {
  const result = await readJsonWithDiagnostics<{
    platform?: PlatformConfig
    adapterOptions?: Partial<Record<string, unknown>>
    [k: string]: unknown
  }>(configPath)

  if (!result.ok) {
    return {}
  }

  const data = result.data as Record<string, unknown> & {
    platform?: PlatformConfig | string
    adapterOptions?: Partial<Record<string, unknown>>
  }

  // Normalise the shorthand form produced by `kb-create` (installed mode),
  // where the top-level `platform` is a bare string pointing at the platform
  // directory instead of the structured `{ dir, adapters, ... }` object used
  // by the dev-mode monorepo. Treat the string as `{ dir: "…" }` so the
  // loader can still honour `platform.dir` without mis-parsing the section.
  const rawPlatform = data.platform
  const normalizedPlatform: PlatformConfig | undefined =
    typeof rawPlatform === 'string'
      ? { platform: { dir: rawPlatform } }
      : rawPlatform

  // Merge top-level adapterOptions into the platform section so initPlatform
  // receives adapter credentials (e.g. llm.kbClientId) alongside adapter bindings.
  const platformSection: PlatformConfig | undefined = normalizedPlatform
    ? { ...normalizedPlatform, adapterOptions: data.adapterOptions ?? normalizedPlatform.adapterOptions }
    : data.adapterOptions
      ? { adapters: {}, adapterOptions: data.adapterOptions }
      : undefined

  return {
    platformSection,
    rawConfig: data,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Load and merge platform configuration, returning the effective config plus
 * diagnostics about how it was resolved.
 *
 * Resolution flow:
 *   1. Resolve `platformRoot` and `projectRoot` via
 *      `@kb-labs/core-workspace/resolveRoots`.
 *   2. If `loadEnvFile !== false`, load `<projectRoot>/.env`.
 *   3. Read `<platformRoot>/.kb/kb.config.json` → `platformDefaults` (if any).
 *   4. Read `<projectRoot>/.kb/kb.config.json` → `projectConfig` (if any).
 *      When both roots resolve to the same directory (dev mode), the same
 *      file is used for both layers and is read only once.
 *   5. `effective = mergeDefined(platformDefaults ?? {}, projectConfig ?? {})`.
 *
 * The function never throws on missing files or malformed JSON — it silently
 * degrades to an empty config so that callers can continue with NoOp
 * adapters. Callers that need strict validation should inspect `sources`.
 */
export async function loadPlatformConfig(
  options: LoadPlatformConfigOptions = {},
): Promise<LoadPlatformConfigResult> {
  const {
    moduleUrl,
    startDir = process.cwd(),
    env = process.env,
    loadEnvFile: shouldLoadEnv = true,
  } = options

  let roots = await resolveRoots({
    moduleUrl,
    startDir,
    env,
  })

  if (shouldLoadEnv) {
    // Load platform root first so project vars take precedence over platform defaults.
    if (roots.platformRoot) loadEnvFile(roots.platformRoot)
    loadEnvFile(roots.projectRoot)
  }

  // Read project config first so we can honor `platform.dir` before picking
  // the platform-config file.
  const projectConfigPath = findConfigAtRoot(roots.projectRoot)
  let projectPlatformConfig: PlatformConfig | undefined
  let rawProjectConfig: Record<string, unknown> | undefined
  let projectConfigSource: string | undefined
  let projectConfigData:
    | Awaited<ReturnType<typeof readConfigFile>>
    | undefined

  if (projectConfigPath) {
    projectConfigData = await readConfigFile(projectConfigPath)
    projectPlatformConfig = projectConfigData.platformSection
    rawProjectConfig = projectConfigData.rawConfig
    projectConfigSource = projectConfigPath
  }

  // Honor `platform.dir` from the project config, if set. This lets a project
  // declare its own platform workspace instead of using the bootstrap-resolved
  // one. Guard against self-reference: if the override resolves to the same
  // path as the project root, we keep the original resolution.
  let platformDirOverride: string | undefined
  // platform.dir may be at projectPlatformConfig.platform.dir (string-shorthand case, where
  // readConfigFile wraps it as { platform: { dir } }), OR at the top level as
  // projectPlatformConfig.dir (structured-object case, where the whole data.platform section
  // is spread into platformSection, leaving dir at the root).
  const declaredPlatformDir =
    projectPlatformConfig?.platform?.dir ??
    (projectPlatformConfig as Record<string, unknown> | undefined)?.['dir'] as string | undefined
  if (declaredPlatformDir) {
    const resolved = expandPlatformDir(declaredPlatformDir, roots.projectRoot)
    if (path.resolve(resolved) !== path.resolve(roots.projectRoot)) {
      platformDirOverride = resolved
      roots = {
        ...roots,
        platformRoot: resolved,
        sameLocation:
          path.resolve(resolved) === path.resolve(roots.projectRoot),
      }
    }
  }

  // Locate the platform config file AFTER honoring platform.dir.
  const platformConfigPath = findConfigAtRoot(roots.platformRoot)
  let platformDefaults: PlatformConfig | undefined
  let platformDefaultsSource: string | undefined

  const samePath =
    !!platformConfigPath &&
    !!projectConfigPath &&
    path.resolve(platformConfigPath) === path.resolve(projectConfigPath)

  if (samePath && projectConfigData) {
    // Single file plays both roles (dev mode). Treat its contents as
    // platform defaults so policy-merge doesn't strip platform-only fields
    // like `adapters`. Project layer is left undefined — the merge is a
    // no-op and `sources.projectConfig` is the only reported source.
    platformDefaults = projectConfigData.platformSection
    projectPlatformConfig = undefined
  } else if (platformConfigPath) {
    const { platformSection } = await readConfigFile(platformConfigPath)
    platformDefaults = platformSection
    platformDefaultsSource = platformConfigPath
  }

  // Policy-aware merge: platform-only fields reject project overrides;
  // mergeable fields deep-merge with project winning.
  const mergeResult = mergeWithFieldPolicy<PlatformConfig>(
    platformDefaults,
    projectPlatformConfig,
    CONFIG_FIELD_SCOPE as Partial<Record<keyof PlatformConfig, FieldMergePolicy>>,
  )

  // Ensure `adapters` is always defined so callers can destructure safely.
  const merged: PlatformConfig = {
    adapters: {},
    ...mergeResult.value,
  }

  // Resolve ${ENV_VAR} placeholders in string values (e.g. baseURL, urls, secrets
  // that live in env vars rather than config files). In non-strict mode so
  // missing vars leave the placeholder intact and fail lazily at use-site rather
  // than blocking bootstrap for unrelated adapters.
  const effective = interpolateConfig(merged, false)

  return {
    platformConfig: effective,
    rawConfig: rawProjectConfig,
    platformRoot: roots.platformRoot,
    projectRoot: roots.projectRoot,
    sameLocation: roots.sameLocation,
    sources: {
      platformDefaults: platformDefaultsSource,
      projectConfig: projectConfigSource,
      roots: roots.sources,
      fields: mergeResult.sources,
      ignoredProjectFields:
        mergeResult.ignoredProjectFields.length > 0
          ? mergeResult.ignoredProjectFields
          : undefined,
      platformDirOverride,
    },
  }
}
