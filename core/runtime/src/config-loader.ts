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
import { existsSync, readFileSync } from 'node:fs'

import {
  readJsonWithDiagnostics,
  mergeDefined,
} from '@kb-labs/core-config'
import { resolveRoots, type RootsResolution } from '@kb-labs/core-workspace'

import type { PlatformConfig } from './config.js'
import { interpolateConfig } from './config-interpolation.js'

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
    platform?: PlatformConfig
    adapterOptions?: Partial<Record<string, unknown>>
  }

  // Merge top-level adapterOptions into the platform section so initPlatform
  // receives adapter credentials (e.g. llm.kbClientId) alongside adapter bindings.
  const platformSection: PlatformConfig | undefined = data.platform
    ? { ...data.platform, adapterOptions: data.adapterOptions ?? data.platform.adapterOptions }
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

  const roots = await resolveRoots({
    moduleUrl,
    startDir,
    env,
  })

  if (shouldLoadEnv) {
    loadEnvFile(roots.projectRoot)
  }

  // Locate both config files. If roots coincide (dev mode), both refer to the
  // same physical file; we read it once.
  const platformConfigPath = findConfigAtRoot(roots.platformRoot)
  const projectConfigPath = findConfigAtRoot(roots.projectRoot)

  let platformDefaults: PlatformConfig | undefined
  let projectPlatformConfig: PlatformConfig | undefined
  let rawProjectConfig: Record<string, unknown> | undefined
  let platformDefaultsSource: string | undefined
  let projectConfigSource: string | undefined

  const samePath =
    !!platformConfigPath &&
    !!projectConfigPath &&
    path.resolve(platformConfigPath) === path.resolve(projectConfigPath)

  if (samePath && projectConfigPath) {
    // Single file plays both roles. Read once, use it as project config only
    // (platform defaults remain undefined — the merge is a no-op).
    const { platformSection, rawConfig } = await readConfigFile(projectConfigPath)
    projectPlatformConfig = platformSection
    rawProjectConfig = rawConfig
    projectConfigSource = projectConfigPath
  } else {
    if (platformConfigPath) {
      const { platformSection } = await readConfigFile(platformConfigPath)
      platformDefaults = platformSection
      platformDefaultsSource = platformConfigPath
    }
    if (projectConfigPath) {
      const { platformSection, rawConfig } = await readConfigFile(projectConfigPath)
      projectPlatformConfig = platformSection
      rawProjectConfig = rawConfig
      projectConfigSource = projectConfigPath
    }
  }

  // Deep-merge layers. mergeDefined treats `undefined` as "keep base", so the
  // order encodes precedence: project overrides platform defaults.
  //
  // The base is `{ adapters: {} }` rather than `{}` so that callers can
  // unconditionally destructure `effective.adapters` (which is the shape
  // existing code — e.g. adapter loader, service init — assumes).
  const base: PlatformConfig = { adapters: {} }
  const merged = mergeDefined(
    mergeDefined(base, platformDefaults),
    projectPlatformConfig,
  ) as PlatformConfig

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
    },
  }
}
